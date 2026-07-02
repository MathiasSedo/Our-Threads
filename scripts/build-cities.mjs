/**
 * Downloads geonames cities15000.txt and produces client/src/data/cities.json
 * Format: [[name, lat, lng, countryCode], ...]
 * Run once: node scripts/build-cities.mjs
 */
import https from 'https';
import { createWriteStream, createReadStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import { createUnzip } from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZIP_URL = 'https://download.geonames.org/export/dump/cities15000.zip';
const ZIP_PATH = path.join(__dirname, '../tmp/cities15000.zip');
const TXT_PATH = path.join(__dirname, '../tmp/cities15000.txt');
const OUT_PATH = path.join(__dirname, '../client/public/cities.json');

// Country code → display name (ISO 3166-1 alpha-2)
const COUNTRY_NAMES = {
  AF:'Afghanistan',AL:'Albania',DZ:'Algeria',AD:'Andorra',AO:'Angola',AG:'Antigua and Barbuda',
  AR:'Argentina',AM:'Armenia',AU:'Australia',AT:'Austria',AZ:'Azerbaijan',BS:'Bahamas',
  BH:'Bahrain',BD:'Bangladesh',BB:'Barbados',BY:'Belarus',BE:'Belgium',BZ:'Belize',BJ:'Benin',
  BT:'Bhutan',BO:'Bolivia',BA:'Bosnia and Herzegovina',BW:'Botswana',BR:'Brazil',BN:'Brunei',
  BG:'Bulgaria',BF:'Burkina Faso',BI:'Burundi',CV:'Cape Verde',KH:'Cambodia',CM:'Cameroon',
  CA:'Canada',CF:'Central African Republic',TD:'Chad',CL:'Chile',CN:'China',CO:'Colombia',
  KM:'Comoros',CG:'Congo',CD:'DR Congo',CR:'Costa Rica',HR:'Croatia',CU:'Cuba',CY:'Cyprus',
  CZ:'Czech Republic',DK:'Denmark',DJ:'Djibouti',DO:'Dominican Republic',EC:'Ecuador',
  EG:'Egypt',SV:'El Salvador',GQ:'Equatorial Guinea',ER:'Eritrea',EE:'Estonia',SZ:'Eswatini',
  ET:'Ethiopia',FJ:'Fiji',FI:'Finland',FR:'France',GA:'Gabon',GM:'Gambia',GE:'Georgia',
  DE:'Germany',GH:'Ghana',GR:'Greece',GT:'Guatemala',GN:'Guinea',GW:'Guinea-Bissau',GY:'Guyana',
  HT:'Haiti',HN:'Honduras',HU:'Hungary',IS:'Iceland',IN:'India',ID:'Indonesia',IR:'Iran',
  IQ:'Iraq',IE:'Ireland',IL:'Israel',IT:'Italy',CI:'Ivory Coast',JM:'Jamaica',JP:'Japan',
  JO:'Jordan',KZ:'Kazakhstan',KE:'Kenya',KP:'North Korea',KR:'South Korea',KW:'Kuwait',
  KG:'Kyrgyzstan',LA:'Laos',LV:'Latvia',LB:'Lebanon',LS:'Lesotho',LR:'Liberia',LY:'Libya',
  LI:'Liechtenstein',LT:'Lithuania',LU:'Luxembourg',MG:'Madagascar',MW:'Malawi',MY:'Malaysia',
  MV:'Maldives',ML:'Mali',MT:'Malta',MR:'Mauritania',MU:'Mauritius',MX:'Mexico',MD:'Moldova',
  MC:'Monaco',MN:'Mongolia',ME:'Montenegro',MA:'Morocco',MZ:'Mozambique',MM:'Myanmar',
  NA:'Namibia',NP:'Nepal',NL:'Netherlands',NZ:'New Zealand',NI:'Nicaragua',NE:'Niger',
  NG:'Nigeria',MK:'North Macedonia',NO:'Norway',OM:'Oman',PK:'Pakistan',PS:'Palestine',
  PA:'Panama',PG:'Papua New Guinea',PY:'Paraguay',PE:'Peru',PH:'Philippines',PL:'Poland',
  PT:'Portugal',QA:'Qatar',RO:'Romania',RU:'Russia',RW:'Rwanda',SA:'Saudi Arabia',
  SN:'Senegal',RS:'Serbia',SL:'Sierra Leone',SG:'Singapore',SK:'Slovakia',SI:'Slovenia',
  SO:'Somalia',ZA:'South Africa',SS:'South Sudan',ES:'Spain',LK:'Sri Lanka',SD:'Sudan',
  SR:'Suriname',SE:'Sweden',CH:'Switzerland',SY:'Syria',TW:'Taiwan',TJ:'Tajikistan',
  TZ:'Tanzania',TH:'Thailand',TL:'Timor-Leste',TG:'Togo',TT:'Trinidad and Tobago',
  TN:'Tunisia',TR:'Turkey',TM:'Turkmenistan',UG:'Uganda',UA:'Ukraine',AE:'United Arab Emirates',
  GB:'United Kingdom',US:'United States',UY:'Uruguay',UZ:'Uzbekistan',VE:'Venezuela',
  VN:'Vietnam',YE:'Yemen',ZM:'Zambia',ZW:'Zimbabwe',XK:'Kosovo',
};

async function download(url, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function unzipTxt(zipPath, txtDest) {
  // geonames zip contains a single .txt file of the same name
  const { default: AdmZip } = await import('adm-zip').catch(() => null);
  if (AdmZip) {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntries()[0];
    await writeFile(txtDest, entry.getData());
    return;
  }
  // Fallback: pipe through zlib (won't work for zip, but included as stub)
  throw new Error('adm-zip not available — run: npm install adm-zip');
}

async function parseCities(txtPath) {
  const rl = createInterface({ input: createReadStream(txtPath), crlfDelay: Infinity });
  const cities = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    const f = line.split('\t');
    // geonames columns: 0=id,1=name,2=asciiname,3=altnames,4=lat,5=lng,
    //   6=feature_class,7=feature_code,8=country_code,...,14=population,...
    if (f[6] !== 'P') continue; // populated places only
    const name = f[1];
    const lat  = parseFloat(f[4]);
    const lng  = parseFloat(f[5]);
    const cc   = f[8];
    if (!name || isNaN(lat) || isNaN(lng) || !cc) continue;
    cities.push([name, Math.round(lat * 100) / 100, Math.round(lng * 100) / 100, cc]);
  }
  return cities;
}

console.log('Downloading cities15000.zip from geonames.org...');
await download(ZIP_URL, ZIP_PATH);
console.log('Download done. Extracting...');

// Use node's built-in to extract (the zip has one entry)
const { execSync } = await import('child_process');
execSync(`unzip -o "${ZIP_PATH}" -d "${path.dirname(TXT_PATH)}"`);
console.log('Extracted. Parsing...');

const cities = await parseCities(TXT_PATH);
console.log(`Parsed ${cities.length} cities. Writing JSON...`);

await mkdir(path.dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, JSON.stringify({ countries: COUNTRY_NAMES, cities }));
console.log(`Done → ${OUT_PATH} (${(JSON.stringify({ countries: COUNTRY_NAMES, cities }).length / 1024).toFixed(0)} KB)`);
