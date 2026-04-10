# Workflow SSE Stream (Server -> UI)

Tài liệu này mô tả luồng stream trạng thái command/workflow từ Node server lên UI bằng SSE, theo implementation hiện tại trong thư mục `server/`.

## 1) Mục tiêu

- Đẩy trạng thái command theo thời gian thực từ queue lên UI.
- UI không cần polling endpoint riêng cho queue state.
- Giữ payload đủ thông tin để map vào timeline workflow trên frontend.

## 2) Kiến trúc tổng quan

1. Frontend mở kết nối SSE:
   - `GET /events/control-queue`
2. Node server giữ danh sách SSE clients.
3. Khi command đi qua `controlQueueService`, server phát event status:
   - `queued`
   - `delay_wait_started`
   - `delay_wait_completed`
   - `dispatched`
   - `completed`
   - `failed`
4. Frontend nhận event `control-queue-status` và render vào UI workflow progress.

## 3) Endpoint SSE

- Path: `/events/control-queue`
- Event:
  - `ready`: gửi ngay sau khi kết nối thành công
  - `control-queue-status`: gửi khi queue có thay đổi trạng thái command

## 4) Luồng nội bộ theo code

### 4.1 Đăng ký SSE route

- File: `server/bootstrap/sse.js`
- `createSseService(app)` tạo:
  - `SSEGatewayService` (route `/events/gateways`)
  - `ControlQueueSseService` (route `/events/control-queue`)

### 4.2 Nối SSE vào MQTT stack

- File: `server/bootstrap/mqtt.js`
- `createMqttStack(...)` inject callback `onStatus` vào `ControlQueueService`.
- Callback này gọi `controlQueueSseService.sendStatus(payload)`.

### 4.3 Phát trạng thái từ queue service

- File: `server/services/controlQueueService.js`
- Các điểm phát status:
  - khi enqueue xong: `queued`
  - trước/sau delay: `delay_wait_started`, `delay_wait_completed`
  - khi publish MQTT thành công: `dispatched`
  - khi nhận ACK và resolve thành công: `completed`
  - khi timeout/lỗi: `failed`

### 4.4 Đẩy về client SSE

- File: `server/services/controlQueueSseService.js`
- `sendStatus(payload)` đóng gói:
  - `id: <incremental>`
  - `event: control-queue-status`
  - `data: <JSON payload>`

## 5) Payload schema (thực tế)

Mỗi event `control-queue-status` có dạng:

```json
{
  "type": "control_queue_status",
  "status": "dispatched",
  "ts": "2026-03-26T03:40:25.123Z",
  "job": {
    "gateway_id": "GW_001",
    "node_id": "node-control-001",
    "action_type": "relay_control",
    "device": "light",
    "state": "on",
    "value": null,
    "delayMs": 5000,
    "wait_for_response": true,
    "response_timeout_ms": 15000,
    "requested_at": "...",
    "requested_at_ms": 0,
    "response_deadline_at": "...",
    "dispatched_at": "...",
    "command_seq": 12
  },
  "queued": 3,
  "dispatch": {
    "topic": "esp32/commands/GW_001",
    "payload": {},
    "dispatched_at": "..."
  },
  "control_response": null,
  "error": null
}
```

Ghi chú:
- Trường `dispatch`, `control_response`, `error` chỉ xuất hiện tùy theo `status`.
- `ts` là timestamp lúc server emit event SSE.

## 6) Frontend consume pattern

Pattern chuẩn (đang dùng ở `ScenarioBuilderSection.vue`):

1. Tạo `EventSource(`${apiConfig.server}/events/control-queue`)`
2. Lắng nghe:
   - `ready`
   - `control-queue-status`
3. Parse `event.data` và map theo `status` để hiển thị:
   - `Command Queued`
   - `Command Started`
   - `Command Finished`
   - `Failed`

## 7) Security & truy cập

Hiện tại route SSE `/events/control-queue` không gắn middleware auth riêng.

Khuyến nghị production:
- Chặn CORS theo allowlist frontend.
- Cân nhắc auth cho SSE route (token query/cookie signed session).
- Giới hạn số connection/client và heartbeat timeout.

## 8) Tệp liên quan

- `server/services/controlQueueSseService.js`
- `server/services/controlQueueService.js`
- `server/bootstrap/sse.js`
- `server/bootstrap/mqtt.js`
- `server/index.js`
- `frontend/app/components/devices-control/sections/ScenarioBuilderSection.vue`

