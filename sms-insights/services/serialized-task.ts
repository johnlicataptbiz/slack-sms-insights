const taskTails = new Map<string, Promise<void>>();

export const runSerializedTask = async <Result>({
  key,
  task,
}: {
  key: string;
  task: () => Promise<Result>;
}): Promise<Result> => {
  const previousTail = taskTails.get(key) || Promise.resolve();
  let releaseCurrentTail: (() => void) | undefined;
  const currentTail = new Promise<void>((resolve) => {
    releaseCurrentTail = resolve;
  });

  taskTails.set(
    key,
    previousTail.then(() => currentTail),
  );

  await previousTail;

  try {
    return await task();
  } finally {
    releaseCurrentTail?.();
    if (taskTails.get(key) === currentTail) {
      taskTails.delete(key);
    }
  }
};
