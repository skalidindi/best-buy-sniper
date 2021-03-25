import { createBrowser, getBrowser } from '@driver/index';
import { BestBuy, wait } from '@pages/bestbuy';
import { getTasks } from '@core/configs';
import { random } from 'lodash';
import { logger } from '@core/logger';
import { sendMessage } from '@core/notifications/notifier';
import { existsSync, writeFileSync } from 'fs';
import pm2 from 'pm2';

const main = async () => {
  const { stores } = getTasks()[0];
  const { bestbuy: bestbuyConfig } = stores;

  if (existsSync('purchase.json')) {
    logger.warn('Purchase completed, sleeping for 2 days');

    await wait(60000 * 60 * 48);

    process.exit(2);
  }

  // sendMessage({message: "BestBuy Sniper started..."})

  const bestbuy = new BestBuy({ products: bestbuyConfig.products });
  let purchaseCompleted = false;

  await bestbuy.open();

  logger.info('Starting purchase attempts');

  try {
    do {
      purchaseCompleted = await bestbuy.purchaseProduct();

      if (!purchaseCompleted) {
        const waitTime = random(30000, 90000);

        logger.warn(`Purchase not completed, waiting ${waitTime} ms before retrying`);

        await wait(waitTime);
      }
    } while (!purchaseCompleted);

    logger.info('Shutting down in 1 minute');

    await Promise.all([
      await sendMessage({ message: 'Shutting down in 1 minute' }),
    ]);

    await wait(60000);

    await bestbuy.close();

    return true;
  } catch (error) {
    console.log(error);

    await bestbuy.close();

    throw error;
  }
};

pm2.connect(async (error) => {
  if (error) {
    logger.error(error);

    process.exit(2);
  }

  await createBrowser();

  const browser = getBrowser();

  let finished = false;

  do {
    try {
      finished = await main();
    } catch (error) {
      logger.error(error);

      if (error.message === 'Browser is considered a bot, aborting attempt') {
        logger.warn('Waiting 10 minutes to refresh bot status');

        await wait(600000);
      }
    }
  } while (!finished);

  await browser.close();

  pm2.delete('main', () => {
    logger.info('Process closed');
  });
});
