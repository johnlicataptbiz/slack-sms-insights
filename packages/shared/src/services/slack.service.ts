import { ApiRequest } from '../types/api';

export interface VerifiedSlackUser {
  id: string;
  name: string;
  email: string;
}

export class SlackService {
  getVerifiedSlackUser(req: ApiRequest): VerifiedSlackUser {
    const user = req.user;
    if (!user || typeof user !== 'object') return {};
    return user as VerifiedSlackUser;
  }
}