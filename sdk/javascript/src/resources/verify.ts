import type { HttpClient } from '../http.js';
import type {
  InitiateParams, InitiateResponse,
  SendOtpParams, SendOtpResponse,
  ConfirmOtpParams, ConfirmOtpResponse,
  UploadIdParams, UploadIdResponse,
  SubmitFaceParams, SubmitFaceResponse,
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
