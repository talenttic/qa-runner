export function validateChangeEvent(event) {
    const errors = [];
    if (!Array.isArray(event.files)) {
        errors.push("files must be an array");
    }
    if (typeof event.timestamp !== "number") {
        errors.push("timestamp must be a number");
    }
    if (event.summary !== undefined && typeof event.summary !== "string") {
        errors.push("summary must be a string");
    }
    if (event.diff !== undefined && typeof event.diff !== "string") {
        errors.push("diff must be a string");
    }
    if (event.tool !== undefined && typeof event.tool !== "string") {
        errors.push("tool must be a string");
    }
    return { ok: errors.length === 0, errors };
}
//# sourceMappingURL=validation.js.map