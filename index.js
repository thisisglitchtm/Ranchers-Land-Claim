import dotenv from 'dotenv';
dotenv.config();

import { Api, JsonRpc, RpcError } from 'eosjs';
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig.js';
import fetch from 'node-fetch';

const privateKeys = [process.env.PRIVATE_KEY];
const OWNER = process.env.OWNER;
const CONTRACT = 'ranchersland';

if (!privateKeys[0] || !OWNER) {
  console.error('ERROR: Missing PRIVATE_KEY or OWNER in .env');
  process.exit(1);
}

const rpc = new JsonRpc('https://wax.greymass.com', { fetch });
const signatureProvider = new JsSignatureProvider(privateKeys);
const api = new Api({
  rpc,
  signatureProvider,
  textDecoder: new TextDecoder(),
  textEncoder: new TextEncoder(),
});

async function getAssetIdsForOwner(owner) {
  const assetIds = [];
  let lowerBound = '';
  while (true) {
    const result = await rpc.get_table_rows({
      json: true,
      code: CONTRACT,
      scope: CONTRACT,
      table: 'stakednft',
      limit: 100,
      lower_bound: lowerBound,
      reverse: false,
    });

    if (!result.rows.length) break;

    for (const row of result.rows) {
      if (row.owner === owner) {
        assetIds.push(row.asset_id);
      }
    }

    if (result.more) {
      lowerBound = result.rows[result.rows.length - 1].asset_id;
    } else {
      break;
    }
  }
  return assetIds;
}

async function getNftNextClaim(asset_id) {
  try {
    const result = await rpc.get_table_rows({
      json: true,
      code: CONTRACT,
      scope: CONTRACT,
      table: 'stakednft',
      lower_bound: asset_id,
      upper_bound: asset_id,
      limit: 1
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].next_claim || null;
  } catch {
    return null;
  }
}

async function claimNft(asset_id) {
  try {
    console.log(`[⚙] Отправляем claim для asset_id ${asset_id}...`);
    const result = await api.transact({
      actions: [{
        account: CONTRACT,
        name: 'claimnft',
        authorization: [{
          actor: OWNER,
          permission: 'active',
        }],
        data: {
          asset_id,
          owner: OWNER,
          wallet: OWNER,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });
    console.log(`[✅] Claim успешен для asset_id ${asset_id}. TxID: ${result.transaction_id}`);
  } catch (e) {
    if (e instanceof RpcError) {
      console.error(`[❌] RPC ошибка для asset_id ${asset_id}:`, JSON.stringify(e.json, null, 2));
    } else {
      console.error(`[❌] Ошибка для asset_id ${asset_id}:`, e);
    }
  }
}

async function processAssets(assetIds) {
  for (const asset_id of assetIds) {
    const nextClaim = await getNftNextClaim(asset_id);
    const now = Math.floor(Date.now() / 1000);

    if (nextClaim === null) {
      console.log(`[❌] NFT ${asset_id} не найден или нет next_claim`);
    } else if (nextClaim <= now) {
      console.log(`[ℹ] Claim доступен для NFT ${asset_id}, пытаемся claim...`);
      await claimNft(asset_id);
    } else {
      const secondsLeft = nextClaim - now;
      console.log(`[⏳] NFT ${asset_id} — claim будет доступен через ${secondsLeft} сек (~${Math.ceil(secondsLeft / 60)} мин)`);
    }

    // Задержка 2 секунды между обработкой каждой NFT
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

async function main() {
  const assetIds = await getAssetIdsForOwner(OWNER);

  if (assetIds.length === 0) {
    console.log(`[ℹ] Нет NFT для claim у пользователя ${OWNER}`);
    return;
  }

  console.log(`[ℹ] Найдено NFT для claim:`);
  assetIds.forEach(id => console.log(`- ${id}`));

  // Первая проверка сразу
  console.log(`\n[⏰] Начинаем первое обновление статуса...`);
  await processAssets(assetIds);

  // Обновление статуса каждую минуту
  setInterval(async () => {
    console.log(`\n[⏰] Обновление статуса для ${assetIds.length} NFT...`);
    await processAssets(assetIds);
  }, 60 * 1000);
}

main();
