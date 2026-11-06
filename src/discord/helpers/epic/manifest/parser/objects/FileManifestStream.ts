// @ts-nocheck
import { FileChunkPart } from "./FileChunkPart.ts";
import { FileManifest } from "./FileManifest.ts";

import { Readable } from "stream";

export class FileManifestStream extends Readable {
  length: number = 0
  position: number = 0
  _streamId: number = Math.random();

  private _chunks: FileChunkPart[]
  private _startPositions: number[]

  constructor(file: FileManifest) {
    super()

    this._chunks = file.Chunks;
    this._startPositions = [ ...Array(this._chunks.length).fill(0) ];

    for (let i = 0; i < this._chunks.length; i++) {
      let chunk = this._chunks[i];

      this._startPositions[i] = this.length;
      this.length += chunk.Size;
    }
  }

  _destroy() {
    // Clear the cached data....
    for (let i=0;i<this._chunks.length;i++) {
      this._chunks[i].clearData();
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async _read(count: number) {
    if (count == 0 || this.position >= this.length) {
      this.push(null)
      return 0
    }

    let bytesRead = 0
    let chunks = []
    while (true) {
      let index = this.getChunkIndex();
      if (index == -1) break;

      let chunk = this._chunks[index];
      if (index > 0) {
        this._chunks[index-1].clearData();
      }
      let data, failed=false, counter=0, failuresAllowed = 20;
      do {
        try {
          counter++;
          data = await chunk.loadData();
          failed = false;
        } catch (e) {
          console.log(e.message);
          // 5xx's we allow a lot of failures, as it will normally be a temporary issue
          if (e.message.indexOf("status '5") > 0) { failuresAllowed = 200; }
          else if (e.message.indexOf("error 'AggregateError'")) { failuresAllowed = 50; }
          failed = true;
          await this._sleep(250);
        }
      } while (failed && counter <= failuresAllowed);
      if (failed) {
        throw new Error('Failed to load data from chunk ' + chunk.Filename );
      }

      let off = this.position - this._startPositions[index];

      let dataSize = chunk.Size - off;
      if (dataSize > count) {
        let buf = Buffer.alloc(count)
        data.copy(buf, 0, off, off + count)
        chunks.push(buf)

        bytesRead += count;
        this.position += count;
        break;
      }
      else {
        let buf = Buffer.alloc(dataSize)
        data.copy(buf, 0, off, off + dataSize)
        chunks.push(buf)

        bytesRead += dataSize;
        count -= dataSize;
        this.position += dataSize;
      }

      if (count <= 0) break;
    }

    this.push(Buffer.concat(chunks))
    return bytesRead
  }

  private getChunkIndex() {
    let pos = this.position;
    for (let i = 0; i < this._chunks.length; i++) {
      let chunk = this._chunks[i];
      if (pos < chunk.Size) return i;
      pos -= chunk.Size;
    }

    return -1;
  }
}
