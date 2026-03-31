// Stub controller to fix import error in src/app.ts
// TODO: implement full AlowareController when ready

export class AlowareController {
  constructor(logger) {
    this.logger = logger;
  }

  async execute(context) {
    this.logger.info('AlowareController.execute stub');
    context.res.json({ status: 'stub' });
  }
}
