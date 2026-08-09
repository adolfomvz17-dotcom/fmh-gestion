// FMH — Envía la notificación del comedor a las profesoras del grado llamado.
// No usa librerías externas: solo Node (crypto + fetch). Se despliega solo en Vercel
// dentro de la carpeta /api. Necesita 2 variables de entorno en Vercel:
//   FMH_SA        = el contenido COMPLETO del archivo .json de la cuenta de servicio
//   NOTIF_SECRET  = fmh-comedor-8Kx2p9Qm   (la misma clave que usa la app)
const crypto = require('crypto');

const SITE = 'https://fmh-gestion.vercel.app';

function b64url(str){ return Buffer.from(str).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64urlBuf(buf){ return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }

async function getAccessToken(sa){
  const now = Math.floor(Date.now()/1000);
  const header = { alg:'RS256', typ:'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  };
  const unsigned = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claims));
  const signer = crypto.createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
  const jwt = unsigned + '.' + b64urlBuf(signer.sign(sa.private_key));
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + encodeURIComponent(jwt)
  });
  const j = await r.json();
  if(!j.access_token) throw new Error('OAuth falló: ' + JSON.stringify(j));
  return j.access_token;
}

module.exports = async (req, res) => {
  if(req.method !== 'POST'){ res.status(405).json({error:'method'}); return; }
  try{
    let body = req.body;
    if(body === undefined || body === null || body === ''){
      body = await new Promise(resolve => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>resolve(d)); });
    }
    if(typeof body === 'string'){ try{ body = JSON.parse(body||'{}'); }catch(e){ body={}; } }

    const grupo  = body && body.grupo;
    const secret = body && body.secret;
    if(secret !== process.env.NOTIF_SECRET){ res.status(401).json({error:'secret'}); return; }
    if(!grupo){ res.status(400).json({error:'falta grupo'}); return; }

    const sa = JSON.parse(process.env.FMH_SA);
    const project = sa.project_id;
    const access = await getAccessToken(sa);

    // 1) Buscar los tokens de las profes de ese grado
    const query = { structuredQuery: {
      from: [{ collectionId:'pushTokens' }],
      where: { fieldFilter: { field:{fieldPath:'grupos'}, op:'ARRAY_CONTAINS', value:{stringValue: grupo} } }
    }};
    const fsRes = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`, {
      method:'POST', headers:{'Authorization':'Bearer '+access,'Content-Type':'application/json'}, body: JSON.stringify(query)
    });
    const rows = await fsRes.json();
    const tokens = (Array.isArray(rows) ? rows : [])
      .map(r => r.document && r.document.fields && r.document.fields.token && r.document.fields.token.stringValue)
      .filter(Boolean);
    if(!tokens.length){ res.status(200).json({sent:0, note:'sin dispositivos registrados para '+grupo}); return; }

    // 2) Enviar la notificación a cada dispositivo
    let ok=0, fail=0;
    for(const t of tokens){
      const message = { message: {
        token: t,
        webpush: {
          headers: { Urgency:'high' },
          notification: {
            title: '🔔 ¡Bajar al comedor!',
            body: grupo + ' — la coordinación te está llamando',
            icon: SITE + '/icon.png',
            badge: SITE + '/icon.png',
            requireInteraction: true,
            tag: 'comedor-fmh',
            renotify: true,
            vibrate: [400,150,400,150,600]
          },
          fcm_options: { link: SITE + '/asistencia.html' }
        }
      }};
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
        method:'POST', headers:{'Authorization':'Bearer '+access,'Content-Type':'application/json'}, body: JSON.stringify(message)
      });
      if(r.ok) ok++; else fail++;
    }
    res.status(200).json({ sent:ok, fail });
  }catch(err){
    res.status(500).json({ error: String(err && err.message || err) });
  }
};
