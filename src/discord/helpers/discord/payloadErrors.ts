function collectErrorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message} ${error.name}`;
  }
  return String(error);
}

/** True when Discord rejected the reply because attachment/payload is too large. */
export function isDiscordPayloadTooLargeError(error: unknown): boolean {
  const code = (error as { code?: number })?.code;
  if (code === 50035 || code === 413) return true;

  const message = collectErrorText(error).toLowerCase();
  return (
    message.includes('request entity too large')
    || message.includes('entity too large')
    || message.includes('payload too large')
    || message.includes('413')
    || (message.includes('file') && message.includes('too large'))
    || (message.includes('attachment') && message.includes('too large'))
    || (message.includes('length') && message.includes('exceed'))
    || message.includes('maximum size')
  );
}
