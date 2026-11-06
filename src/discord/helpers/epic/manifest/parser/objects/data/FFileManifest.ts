// @ts-nocheck
import { EFileMetaFlags } from "#helpers/epic/manifest/parser/enums/EFileMetaFlags.ts";

import { FChunkPart } from "./FChunkPart.ts";

import { FSHAHash } from "../misc/FSHAHash.ts";
import {FSHA256Hash} from "../misc/FSHA256Hash.ts";

export class FFileManifest {
  /* The build relative filename. */
  Filename: string
  /* Whether this is a symlink to another file. */
  SymlinkTarget: string
  /* The file SHA1. */
  FileHash: FSHAHash
  /* The flags for this file. */
  FileMetaFlags: EFileMetaFlags
  /* The installation tags for this file. */
  InstallTags: string[]
  /* The list of chunk parts to stitch. */
  ChunkParts: FChunkPart[]
  /* The size of this file. */
  FileSize: number

  md5Hash: string
  mimeType: string
  sha256Hash: FSHA256Hash

  constructor() { }
}
