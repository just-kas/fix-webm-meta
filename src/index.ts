import { tools, Reader } from "ts-ebml";
import LargeFileDecorder from "./decoder";

/**
 * fix webm media file without 2GB filesize limit
 *
 * @param the blob you need to fix
 * @returns the blob that has been fixed
 *
 * using this function can not only add "Duration" but also add "SeekHead", "Seek", "SeekID", "SeekPosition" for the webm
 * if a webm loss "SeekHead", "Seek", "SeekID", "SeekPosition" and "Cues", "CueTime", "CueTrack", "CueClusterPosition", "CueTrackPositions", "CuePoint",
 * then the webm will not seekable when playing in chrome with builtin <video> tag
 * that means only when all webm is donwloaded then user can seek location
 * now with the help of ts-ebml library, this issue solved by recalculate metadata
 * however ts-ebml doesn't support large file larger than 2 GB
 *
 */
export default async function fixWebmMetaInfo(
  blob: Blob,
  duration: number
): Promise<Blob> {
  const decoder = new LargeFileDecorder();
  const reader = new Reader();
  reader.logging = false;

  let bufSlices: ArrayBuffer[] = [];
  let blobSlices: Blob[] = [];

  // 1GB slice is good, but dont set this value larger than 2046 * 1024 * 1024 due to new Uint8Array's limit
  const sliceLength = 1 * 1024 * 1024 * 1024;
  for (let i = 0; i < blob.size; i = i + sliceLength) {
    const slice = blob.slice(i, Math.min(i + sliceLength, blob.size));
    const bufSlice = await slice.arrayBuffer();
    bufSlices.push(bufSlice);
    blobSlices.push(slice);
  }

  decoder.decode(bufSlices).forEach((elm) => reader.read(elm));
  reader.stop();

  const refinedMetadataBuf = tools.makeMetadataSeekable(
    reader.metadatas,
    duration || reader.duration,
    reader.cues
  );
  const refinedMetadataBlob = new Blob([refinedMetadataBuf], {
    type: blob.type,
  });

  const firstPartBlobSlice = blobSlices.shift();
  const firstPartBlobWithoutMetadata = firstPartBlobSlice!.slice(
    reader.metadataSize
  );
  // using Blob instead of ArrayBuffer to construct the new Blob, to minify memory leak
  const finalBlob = new Blob(
    [refinedMetadataBlob, firstPartBlobWithoutMetadata, ...blobSlices],
    { type: blob.type }
  );

  bufSlices = [];
  blobSlices = [];

  return finalBlob;
}
