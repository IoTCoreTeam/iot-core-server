function normalizeTimestamp(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value === 'number') {
        if (value > 1e12) {
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
    }
    return null;
}

function formatLocalIso(value) {
    const pad = (num, len = 2) => String(num).padStart(len, '0');
    const year = value.getFullYear();
    const month = pad(value.getMonth() + 1);
    const day = pad(value.getDate());
    const hour = pad(value.getHours());
    const minute = pad(value.getMinutes());
    const second = pad(value.getSeconds());
    const ms = pad(value.getMilliseconds(), 3);
    const offsetMinutes = -value.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const offsetHour = pad(Math.floor(absOffset / 60));
    const offsetMinute = pad(absOffset % 60);

    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}${sign}${offsetHour}:${offsetMinute}`;
}

function formatTimestampForSse(value) {
    const parsed = normalizeTimestamp(value);
    return parsed ? formatLocalIso(parsed) : null;
}

module.exports = {
    normalizeTimestamp,
    formatLocalIso,
    formatTimestampForSse,
};
