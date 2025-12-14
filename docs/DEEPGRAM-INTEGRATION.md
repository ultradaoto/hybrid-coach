There’s no information about LiveKit integration in the provided Deepgram docs, so I can’t give LiveKit-specific code. I can, however, give you concrete Node/TypeScript-friendly examples for the Deepgram side (STT, Voice Agent, TTS) and point out how to wire them into whatever media layer (e.g., LiveKit) you’re using.

Below are minimal, cost-conscious building blocks you can drop into your Bun/Node TypeScript project and then hook up to LiveKit audio tracks yourself.

---

## 1. Install & basic setup (Ubuntu, Bun/Node)

From your project root:

```bash
bun add @deepgram/sdk dotenv
# or with npm:
# npm install @deepgram/sdk dotenv
```

Create `.env`:

```env
DEEPGRAM_API_KEY=your_real_key_here
```

Load it at startup:

```ts
// src/config/deepgram.ts
import { createClient } from '@deepgram/sdk';
import 'dotenv/config';

if (!process.env.DEEPGRAM_API_KEY) {
  throw new Error('DEEPGRAM_API_KEY is not set');
}

export const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
```

---

## 2. Low-cost live STT stream (to plug LiveKit audio into)

This is the core: one Deepgram streaming connection that you feed with raw audio chunks (e.g., PCM/Opus decoded from LiveKit). The example uses Node’s `fetch` stream, but you’ll replace that with your LiveKit audio pipeline and call `connection.send(chunk)` with each PCM/encoded chunk. [[Live streaming](https://developers.deepgram.com/docs/live-streaming-audio)]

```ts
// src/stt/liveStt.ts
import { deepgram } from '../config/deepgram';
import { LiveTranscriptionEvents } from '@deepgram/sdk';

export async function createSttSession() {
  // Create a live transcription connection
  const connection = deepgram.listen.live({
    model: 'nova-3',
    language: 'en-US',
    smart_format: true,
    // keep costs lower by avoiding extra features unless needed
    // utterance_end_ms, interim_results, etc. can be added later
  });

  connection.on(LiveTranscriptionEvents.Open, () => {
    console.log('Deepgram STT connection opened');
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel.alternatives[0]?.transcript || '';
    if (transcript) {
      console.log('Transcript:', transcript);
      // TODO: route to your coaching logic / AI Agent
    }
  });

  connection.on(LiveTranscriptionEvents.Metadata, (data) => {
    console.log('STT metadata:', data);
  });

  connection.on(LiveTranscriptionEvents.Error, (err) => {
    console.error('STT error:', err);
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    console.log('Deepgram STT connection closed');
  });

  return connection;
}
```

**Where LiveKit fits:**  
Inside your LiveKit track callback (e.g., when you get PCM frames), do something like:

```ts
// pseudo-code, you must adapt to LiveKit’s API
import { createSttSession } from './stt/liveStt';

const sttConnection = await createSttSession();

liveKitAudioTrack.on('pcm', (chunk: Buffer) => {
  if (sttConnection.getReadyState() === 1) {
    sttConnection.send(chunk);
  }
});
```

---

## 3. Keep the connection open without paying for silence

To avoid reconnection overhead but not pay for silence, keep the websocket open with `KeepAlive` while sending **no audio**. Deepgram doesn’t bill when no audio is processed; silent audio still incurs cost. [[Audio keep-alive](https://developers.deepgram.com/docs/audio-keep-alive); [Silence pricing](https://github.com/orgs/deepgram/discussions/293)]

```ts
// src/stt/keepAlive.ts
import { deepgram } from '../config/deepgram';
import { LiveTranscriptionEvents } from '@deepgram/sdk';

export async function createKeepAliveSttSession() {
  const connection = deepgram.listen.live({
    model: 'nova-3',
    language: 'en-US',
    smart_format: true,
  });

  let keepAliveTimer: NodeJS.Timeout | undefined;

  connection.on(LiveTranscriptionEvents.Open, () => {
    console.log('Connection opened.');
    // Send KeepAlive every ~3 seconds
    keepAliveTimer = setInterval(() => {
      console.log('KeepAlive sent.');
      connection.keepAlive();
    }, 3000);
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    console.log('Connection closed.');
    if (keepAliveTimer) clearInterval(keepAliveTimer);
  });

  connection.on(LiveTranscriptionEvents.Error, (err) => {
    console.error(err);
  });

  return connection;
}
```

When user is **not speaking**:

- Stop streaming audio chunks.
- Keep sending `connection.keepAlive()` at intervals.
- When user speaks again, resume `connection.send(chunk)`.

---

## 4. Recommended encodings & sample rates (for low cost)

If you control the audio format, Deepgram suggests `linear16` at 8 kHz to minimize bandwidth and processing while still working well for telephony-like use cases. [[Optimal encoding](https://deepgram.gitbook.io/help-center/faq/what-is-the-optimal-encoding-and-sample-rate-to-send-to-deepgram)]

```ts
const connection = deepgram.listen.live({
  model: 'nova-3',
  encoding: 'linear16',
  sample_rate: 8000,
});
```

Match this to whatever you produce from LiveKit (you may need to resample/convert on your side).

---

## 5. Voice Agent (all-in-one STT + LLM + TTS) option

If you want Deepgram to handle STT + LLM + TTS in a single websocket (instead of stitching services yourself), use the Voice Agent API. That can simplify your stack, which can indirectly help costs by cutting round-trips. You configure everything via a `Settings` message. [[Voice Agent settings](https://developers.deepgram.com/docs/voice-agent-settings); [[Configure agent](https://developers.deepgram.com/docs/configure-voice-agent)]

Here’s the minimal JSON `Settings` payload you’d send after opening a websocket to `wss://agent.deepgram.com/v1/agent/converse`:

```json
{
  "type": "Settings",
  "audio": {
    "input": {
      "encoding": "linear16",
      "sample_rate": 24000
    },
    "output": {
      "encoding": "linear16",
      "sample_rate": 24000,
      "container": "none"
    }
  },
  "agent": {
    "language": "en",
    "listen": {
      "provider": {
        "type": "deepgram",
        "model": "nova-3"
      }
    },
    "think": {
      "provider": {
        "type": "open_ai",
        "model": "gpt-4o-mini",
        "temperature": 0.7
      },
      "prompt": "You are a friendly AI coach helping users improve in real time."
    },
    "speak": {
      "provider": {
        "type": "deepgram",
        "model": "aura-2-thalia-en"
      }
    },
    "greeting": "Hi! I'm your AI coach. What are we working on today?"
  }
}
```

Example of the same configuration using the Python SDK (for reference) shows the required structure. [[Build basic agent](https://developers.deepgram.com/docs/voice-agent#5-configure-the-agent)]

LiveKit integration: you’d:

1. Open the Voice Agent websocket.
2. Send this `Settings` JSON once.
3. Stream microphone audio frames from LiveKit to the agent websocket as binary.
4. Play back the TTS audio from agent responses into LiveKit.

---

## 6. Text-to-Speech (TTS) with Node (for your “Coach” replies)

If you keep your own LLM stack and just use Deepgram for speech, here’s a simple TTS function in Node that writes audio to a file (you can instead stream it into LiveKit). [[TTS SDK](https://developers.deepgram.com/docs/text-to-speech#sdks)]

```ts
// src/tts/tts.ts
import { deepgram } from '../config/deepgram';
import * as fs from 'fs';

export async function synthesizeToFile(text: string, outPath = 'coach-output.wav') {
  const response = await deepgram.speak.request(
    { text },
    {
      model: 'aura-2-thalia-en',
      encoding: 'linear16',
      container: 'wav',
    }
  );

  const stream = await response.getStream();
  if (!stream) {
    throw new Error('No audio stream returned from TTS');
  }

  const buffer = await getAudioBuffer(stream);
  fs.writeFileSync(outPath, buffer);
  console.log('Wrote TTS audio to', outPath);
}

// helper – identical in docs
async function getAudioBuffer(response: ReadableStream<Uint8Array>) {
  const reader = response.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  const dataArray = chunks.reduce(
    (acc, chunk) => Uint8Array.from([...acc, ...chunk]),
    new Uint8Array(0)
  );

  return Buffer.from(dataArray.buffer);
}
```

You can then route `buffer` directly into a LiveKit track instead of writing a file.

---

## 7. Cost-control pointers based on docs

From the docs and FAQs:

- **Billing is by processed audio second**; silence still costs if you send it as audio. Don’t stream silence; use `KeepAlive` when idle. [[Pricing silence](https://github.com/orgs/deepgram/discussions/293)]
- **KeepAlive** keeps websocket open with **no charge** when no audio is sent. [[Audio keep-alive](https://developers.deepgram.com/docs/audio-keep-alive)]
- Use lower-bandwidth encodings (`linear16` at `8000` Hz or `mulaw`) when latency and quality are acceptable, to cut egress and CPU. [[Optimal encoding](https://deepgram.gitbook.io/help-center/faq/what-is-the-optimal-encoding-and-sample-rate-to-send-to-deepgram)]
- Avoid extra features (diarization, intelligence, etc.) unless necessary; they add compute and sometimes rate-limit overhead. [[Intelligence throughput](https://deepgram.gitbook.io/help-center/faq/how-do-i-maximize-my-intelligence-throughput)]

---

If you describe how you’re currently getting audio out of LiveKit (PCM vs Opus, sample rate), I can help you adapt one of the Deepgram streaming patterns above more precisely to that format, staying within what’s documented.