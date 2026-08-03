/**
 * Toàn bộ API của trang mời hẹn.
 *
 *  GET    /api/config          -> cấu hình đang dùng (công khai)
 *  POST   /api/submit          -> ghi nhận lượt đồng ý + lời nhắn
 *  GET    /api/music           -> nhạc nền (file admin tải lên, không có thì dùng file mặc định)
 *
 *  POST   /api/admin/login     -> kiểm tra mật khẩu
 *  GET    /api/admin/data      -> cấu hình + toàn bộ lời nhắn
 *  PUT    /api/admin/config    -> lưu cấu hình
 *  POST   /api/admin/music     -> tải nhạc mới lên (gửi thẳng bytes)
 *  DELETE /api/admin/music     -> quay về nhạc mặc định
 *  DELETE /api/admin/sub       -> xoá một lời nhắn  { id }
 */

export const DEFAULT_CONFIG = {
  story: [
    { art: '💌', text: 'Khoan đã… đừng bấm vội. Đọc cái này trước đã nha 🙈' },
    { art: '⚔️', text: 'Đã lâu rồi chưa thấy em on ARAM, toàn mải mê Naraka thôi.' },
    { art: '🎧', text: 'Anh có chuẩn bị một thứ nho nhỏ. Không tốn tiền đâu… chỉ tốn thời gian của em thôi 👉👈' },
    { art: '🥺', text: 'Bấm tiếp là biết liền. Mà báo trước, đọc rồi thì không quay đầu được đâu đó.' }
  ],
  nextLabel: 'Tiếp tục đọc →',
  lastLabel: 'Rồi, nói đi 👀',

  askArt: '🎮',
  headline: 'Tối nay chơi game với anh nha?',
  askSub: 'Anh giữ sẵn chỗ trong phòng rồi, chỉ còn thiếu mỗi em thôi 🥺',
  time: '22h30 tối nay',
  yesLabel: 'Đồng ý 💖',
  noLabel: 'Không đồng ý',
  firstTaunt: 'Ơ kìa, bấm trượt rồi 😜',
  catLines: [
    'Đừng mà 🥺',
    'Hứa sẽ không feed 🥺',
    'Hứa sẽ ko bật em 🥺',
    'Hứa sẽ ngoan 🥺'
  ],

  okTitle: 'Yeahhh! Chốt kèo nha 💗',
  okSub: 'Biết ngay là em sẽ đồng ý mà, nút kia có chạy đằng trời 😌',
  place: 'Discord — trò chuyện bang Thanh Long',
  note: 'Chơi tới 12h thôi cho em còn ngủ',

  msgLabel: 'Nhắn cho anh vài chữ nha 💌',
  msgPlaceholder: 'Viết gì đó cho anh…',
  sendLabel: 'Gửi 💌',
  sentText: 'Nhận được rồi nha, cảm ơn em 💗',

  musicOn: true
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

const ok = (env) => env && env.STORE;

/* Cắt khoảng trắng hai đầu để mật khẩu không bị hỏng vì ký tự xuống dòng lúc nạp secret. */
const clean = (s) => String(s == null ? '' : s).trim();

function authed(request, env) {
  const given = clean(request.headers.get('x-admin-pass'));
  const real = clean(env.ADMIN_PASS);
  return real.length > 0 && given === real;
}

async function readConfig(env) {
  const saved = await env.STORE.get('config', 'json');
  return { ...DEFAULT_CONFIG, ...(saved || {}) };
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const parts = Array.isArray(params.route) ? params.route : [params.route].filter(Boolean);
  const path = parts.join('/');
  const method = request.method.toUpperCase();

  if (!ok(env)) return json({ error: 'Chưa gắn kho dữ liệu KV' }, 500);

  try {
    /* ---------------- công khai ---------------- */

    if (path === 'config' && method === 'GET') {
      return json(await readConfig(env));
    }

    if (path === 'music' && method === 'GET') {
      const meta = await env.STORE.get('music:meta', 'json');
      if (!meta) return Response.redirect(new URL('/assets/bgm.mp3', request.url).toString(), 302);
      const body = await env.STORE.get('music', 'arrayBuffer');
      if (!body) return Response.redirect(new URL('/assets/bgm.mp3', request.url).toString(), 302);
      return new Response(body, {
        headers: {
          'content-type': meta.type || 'audio/mpeg',
          'cache-control': 'public, max-age=300'
        }
      });
    }

    if (path === 'submit' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const note = String(body.note || '').slice(0, 2000);
      const dodges = Number.isFinite(+body.dodges) ? Math.max(0, Math.min(9999, +body.dodges)) : 0;

      let id = typeof body.id === 'string' && body.id.startsWith('sub:') ? body.id : null;

      if (id) {
        const cur = await env.STORE.get(id, 'json');
        if (cur) {
          cur.note = note || cur.note;
          cur.dodges = dodges || cur.dodges;
          cur.noteAt = new Date().toISOString();
          await env.STORE.put(id, JSON.stringify(cur));
          return json({ ok: true, id });
        }
        id = null;                                  // bản ghi đã bị xoá -> tạo mới
      }

      id = 'sub:' + Date.now() + '-' + crypto.randomUUID().slice(0, 8);
      await env.STORE.put(id, JSON.stringify({
        at: new Date().toISOString(),
        choice: 'yes',
        dodges,
        note,
        ua: (request.headers.get('user-agent') || '').slice(0, 200),
        country: request.headers.get('cf-ipcountry') || ''
      }));
      return json({ ok: true, id });
    }

    /* ---------------- khu quản trị ---------------- */

    if (parts[0] === 'admin') {
      const sub = parts[1] || '';


      if (sub === 'login' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const given = clean(body.pass);
        const real = clean(env.ADMIN_PASS);
        if (!real) return json({ ok: false, error: 'Chưa đặt mật khẩu quản trị' }, 500);
        if (given !== real) return json({ ok: false, error: 'Sai mật khẩu' }, 401);
        return json({ ok: true });
      }

      if (!authed(request, env)) return json({ error: 'Chưa đăng nhập' }, 401);

      if (sub === 'data' && method === 'GET') {
        const list = await env.STORE.list({ prefix: 'sub:', limit: 1000 });
        const subs = await Promise.all(list.keys.map(async (k) => {
          const v = await env.STORE.get(k.name, 'json');
          return v ? { id: k.name, ...v } : null;
        }));
        const meta = await env.STORE.get('music:meta', 'json');
        return json({
          config: await readConfig(env),
          subs: subs.filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : -1)),
          music: meta || null
        });
      }

      if (sub === 'config' && method === 'PUT') {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') return json({ error: 'Dữ liệu không hợp lệ' }, 400);
        const clean = {};
        for (const k of Object.keys(DEFAULT_CONFIG)) {
          if (body[k] !== undefined) clean[k] = body[k];
        }
        await env.STORE.put('config', JSON.stringify(clean));
        return json({ ok: true, config: { ...DEFAULT_CONFIG, ...clean } });
      }

      if (sub === 'music' && method === 'POST') {
        const type = request.headers.get('x-file-type') || 'audio/mpeg';
        const name = decodeURIComponent(request.headers.get('x-file-name') || 'bgm');
        const buf = await request.arrayBuffer();
        if (!buf.byteLength) return json({ error: 'File rỗng' }, 400);
        if (buf.byteLength > 24 * 1024 * 1024) return json({ error: 'File quá 24MB' }, 413);
        await env.STORE.put('music', buf);
        const meta = { type, name, size: buf.byteLength, at: new Date().toISOString() };
        await env.STORE.put('music:meta', JSON.stringify(meta));
        return json({ ok: true, music: meta });
      }

      if (sub === 'music' && method === 'DELETE') {
        await env.STORE.delete('music');
        await env.STORE.delete('music:meta');
        return json({ ok: true });
      }

      if (sub === 'sub' && method === 'DELETE') {
        const body = await request.json().catch(() => ({}));
        const id = String(body.id || '');
        if (!id.startsWith('sub:')) return json({ error: 'id không hợp lệ' }, 400);
        await env.STORE.delete(id);
        return json({ ok: true });
      }
    }

    return json({ error: 'Không có đường dẫn này' }, 404);
  } catch (err) {
    return json({ error: String(err && err.message || err) }, 500);
  }
}
