import type { HttpClient } from '../http.js';
import type {
  IdentityCheckParams, IdentityCheckResponse,
  ConnectParams, ConnectResponse,
  IdentityProfile,
  FlagIdentityParams, FlagIdentityResponse,
  VouchParams, VouchResponse,
  Vouch,
} from '../types.js';

export class IdentityResource {
  constructor(private readonly http: HttpClient) {}

  check(params: IdentityCheckParams): Promise<IdentityCheckResponse> {
    return this.http.get('/identity/check', params as Record<string, string>);
  }

  connect(params: ConnectParams): Promise<ConnectResponse> {
    return this.http.post('/identity/connect', params);
  }

  getProfile(identityId: string): Promise<IdentityProfile> {
    return this.http.get(`/identity/profile/${identityId}`);
  }

  flag(params: FlagIdentityParams): Promise<FlagIdentityResponse> {
    return this.http.post('/identity/flag', params);
  }

  vouch(params: VouchParams): Promise<VouchResponse> {
    return this.http.post('/identity/vouch', params);
  }

  getVouches(identityId: string): Promise<{ vouches: Vouch[] }> {
    return this.http.get(`/identity/vouches/${identityId}`);
  }
}
