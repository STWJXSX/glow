// @ts-nocheck
import axios from 'axios';

export async function request({ uri, method = 'get', headers = {}, body = null }): Promise<Response> {
  const res = await axios({
    url: uri,
    method,
    headers: {
      'User-Agent': 'GlowSpritePakDownloader/1.0',
      ...headers,
    },
    data: body ?? undefined,
    responseType: 'arraybuffer',
    validateStatus: () => true,
    maxRedirects: 8,
    timeout: 120_000,
  });

  return new Response(
    res.status,
    res.headers,
    Buffer.from(res.data ?? []),
  );
}

export class Response {
  status: number;
  headers: object;
  content: Buffer;

  constructor(inStatus, inHeaders, inContent) {
    this.status = inStatus;
    this.headers = inHeaders;
    this.content = inContent;
  }
}
