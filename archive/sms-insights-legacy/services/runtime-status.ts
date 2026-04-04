export type RuntimeCheckStatus = 'ok' | 'warn' | 'error' | 'disabled' | 'unknown';

type RuntimeStatusState = {
  slackAuth: {
    status: RuntimeCheckStatus;
    detail: string;
    updatedAt: string | null;
  };
};

const state: RuntimeStatusState = {
  slackAuth: {
    status: 'unknown',
    detail: 'Slack runtime status has not been initialized yet',
    updatedAt: null,
  },
};

export const setSlackAuthRuntimeStatus = (status: RuntimeCheckStatus, detail: string): void => {
  state.slackAuth = {
    status,
    detail,
    updatedAt: new Date().toISOString(),
  };
};

export const getSlackAuthRuntimeStatus = (): RuntimeStatusState['slackAuth'] => {
  return state.slackAuth;
};
