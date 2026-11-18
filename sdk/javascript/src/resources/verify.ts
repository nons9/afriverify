import type { HttpClient } from '../http.js';
import type {
  InitiateParams, InitiateResponse,
  SendOtpParams, SendOtpResponse,
  ConfirmOtpParams, ConfirmOtpResponse,
  UploadIdParams, UploadIdResponse,
  SubmitFaceParams, SubmitFaceResponse,
  StartLivenessParams, StartLivenessResponse,
  CompleteLivenessParams, CompleteLivenessResponse,
  SessionStatusResponse,
} from '../types.js';

export class VerifyResource {
  constructor(private readonly http: HttpClient) {}

  initiate(params: InitiateParams): Promise<InitiateResponse> {
    return this.http.post('/verify/initiate', params);
  }

  sendOtp(params: SendOtpParams): Promise<SendOtpResponse> {
    return this.http.post('/verify/otp/send', params);
  }

  confirmOtp(params: ConfirmOtpParams): Promise<ConfirmOtpResponse> {
    return this.http.post('/verify/otp/confirm', params);
  }

  async uploadId(params: UploadIdParams): Promise<UploadIdResponse> {
    const form = new FormData();
    form.append('session_token', params.session_token);
    form.append('front', await toBlob(params.front), 'front.jpg');
    if (params.back) {
      form.append('back', await toBlob(params.back), 'back.jpg');
    }
    return this.http.postForm('/verify/id/upload', form);
  }

  async submitFace(params: SubmitFaceParams): Promise<SubmitFaceResponse> {
    const form = new FormData();
    form.append('session_token', params.session_token);
    form.append('selfie', await toBlob(params.selfie), 'selfie.jpg');
    return this.http.postForm('/verify/face/submit', form);
  }

  /** Start a live face scan; returns the random challenge sequence the user must perform. */
  startLiveness(params: StartLivenessParams): Promise<StartLivenessResponse> {
    return this.http.post('/verify/face/liveness/start', params);
  }

  /** Submit the frames captured while the user performed the challenges. */
  async completeLiveness(params: CompleteLivenessParams): Promise<CompleteLivenessResponse> {
    const form = new FormData();
    form.append('session_token', params.session_token);
    form.append('liveness_id', params.liveness_id);
    form.append('meta', JSON.stringify({ timestamps_ms: params.timestamps_ms, windows: params.windows, flash: params.flash }));
    for (let i = 0; i < params.frames.length; i++) {
      form.append('frames', await toBlob(params.frames[i]), `f${i}.jpg`);
    }
    return this.http.postForm('/verify/face/liveness/complete', form);
  }

  getStatus(sessionToken: string): Promise<SessionStatusResponse> {
    return this.http.get(`/verify/status/${sessionToken}`);
  }
}

async function toBlob(src: Buffer | Blob | string): Promise<Blob> {
  if (src instanceof Blob) return src;
  if (Buffer.isBuffer(src)) return new Blob([new Uint8Array(src)], { type: 'image/jpeg' });
  // base64 string
  const binary = Buffer.from(src, 'base64');
  return new Blob([new Uint8Array(binary)], { type: 'image/jpeg' });
}
