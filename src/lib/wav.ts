/**
 * Reads and writes WAV sound files.
 *
 * A WAV file is a short header followed by the raw samples. The header says
 * how many samples there are a second, how many channels, and how each
 * sample is stored. Pure code: it works on bytes and touches no disk.
 */

export type Sound = {
  sampleRate: number;
  /** One channel, values from -1 to 1. Stereo files are mixed down. */
  samples: Float32Array;
};

function text(view: DataView, at: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(at + i));
  return out;
}

/** Read a WAV file's bytes. Throws with a plain reason if it cannot. */
export function readWav(bytes: ArrayBuffer): Sound {
  const view = new DataView(bytes);
  if (view.byteLength < 12 || text(view, 0, 4) !== 'RIFF' || text(view, 8, 4) !== 'WAVE') {
    throw new Error('Not a WAV file.');
  }

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataAt = -1;
  let dataLength = 0;

  // The file is a list of labelled blocks. Walk them to find the two needed.
  let at = 12;
  while (at + 8 <= view.byteLength) {
    const label = text(view, at, 4);
    const length = view.getUint32(at + 4, true);
    const body = at + 8;
    if (label === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      // An "extensible" header keeps the real format a little further in.
      if (format === 0xfffe && length >= 26) format = view.getUint16(body + 24, true);
    } else if (label === 'data') {
      dataAt = body;
      dataLength = Math.min(length, view.byteLength - body);
      break;
    }
    at = body + length + (length % 2);
  }

  if (channels === 0 || sampleRate === 0) throw new Error('The WAV file has no format block.');
  if (dataAt === -1) throw new Error('The WAV file has no sound in it.');

  const bytesPerSample = bits / 8;
  let read: (offset: number) => number;
  if (format === 1 && bits === 16) read = (o) => view.getInt16(o, true) / 32768;
  else if (format === 1 && bits === 8) read = (o) => (view.getUint8(o) - 128) / 128;
  else if (format === 1 && bits === 24) {
    read = (o) => ((view.getInt8(o + 2) << 16) | view.getUint16(o, true)) / 8388608;
  } else if (format === 1 && bits === 32) read = (o) => view.getInt32(o, true) / 2147483648;
  else if (format === 3 && bits === 32) read = (o) => view.getFloat32(o, true);
  else throw new Error(`This kind of WAV is not supported (format ${format}, ${bits} bits).`);

  const count = Math.floor(dataLength / (bytesPerSample * channels));
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      sum += read(dataAt + (i * channels + channel) * bytesPerSample);
    }
    samples[i] = sum / channels;
  }
  return { sampleRate, samples };
}

/** Write one channel of sound as a 16-bit WAV file. */
export function writeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const label = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
  };
  label(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  label(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); // size of the format block
  view.setUint16(20, 1, true); // plain PCM
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes a second
  view.setUint16(32, 2, true); // bytes per sample
  view.setUint16(34, 16, true); // bits per sample
  label(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const clipped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(clipped * 32767), true);
  }
  return bytes;
}
