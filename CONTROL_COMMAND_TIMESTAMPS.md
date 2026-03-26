# Control Command Timestamps

Tài liệu này mô tả các trường thời gian liên quan đến luồng `control command -> status-event -> control_acks`.

## 1) Các mốc thời gian được ghi

- `requested_at` (ISO string)
  - Ý nghĩa: thời điểm server tạo/yêu cầu command.
  - Nguồn: `controlQueueService.enqueue(...)`.

- `requested_at_ms` (number, epoch ms)
  - Ý nghĩa: bản ms của `requested_at` để tính nhanh.
  - Nguồn: `controlQueueService.enqueue(...)`.

- `dispatched_at` (ISO string)
  - Ý nghĩa: thời điểm server publish MQTT command thành công.
  - Nguồn: `controlQueueService.publishNow(...)`, sau đó gắn vào waiter metadata và lưu vào `control_acks` khi ACK match.

- `response_deadline_at` (ISO string | null)
  - Ý nghĩa: hạn chót mong đợi nhận status-event.
  - Nguồn: từ payload command; nếu thiếu thì server tự tính `requested_at_ms + response_timeout_ms`.

- `timestamp` (ISO string | null)
  - Ý nghĩa: `gateway_timestamp` do gateway/controller gửi trong status-event.
  - Nguồn: payload MQTT `esp32/controllers/status-event`.
  - Ghi chú: dùng cho debug clock gateway, không còn là mốc chính để tính latency trong UI mới.

- `received_at` (Date)
  - Ý nghĩa: thời điểm server nhận status-event và chuẩn bị ghi DB.
  - Nguồn: `handleControllerStatusEvent` (`new Date()`).

- `command_exec_ms` (number | null)
  - Ý nghĩa: thời gian xử lý command ở firmware/controller.
  - Nguồn: payload status-event.

## 2) Mô hình thời gian chuẩn hiện tại (server-only)

UI trace ưu tiên các mốc server:

1. `requested_at` (backend)
2. `dispatched_at` (server publish)
3. `received_at` (server ingest)

Các duration:

- `Queue = dispatched_at - requested_at`
- `Transport + Device + Ingest = received_at - dispatched_at`
- `End-to-end = received_at - requested_at`

## 3) Vì sao vẫn lưu `timestamp` (gateway)

- Để đối chiếu lệch đồng hồ gateway/server (clock skew).
- Để debug firmware/network path.
- Không dùng làm mốc chính cho KPI latency vì có thể âm khi clock không đồng bộ.

## 4) Ghi chú về dữ liệu cũ

- Bản ghi cũ có thể chưa có `dispatched_at`.
- Với bản ghi cũ, một số duration server-only sẽ không tính được và UI có thể hiển thị `-`.
