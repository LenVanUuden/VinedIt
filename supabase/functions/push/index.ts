// =====================================================================
// Pushberichten (weekendseintje)
//  action "key"  → publieke VAPID-sleutel (maakt het sleutelpaar eenmalig aan)
//  action "send" → door pg_cron elke 15 min op vrijdag: stuurt naar wie aan de beurt is
//                  (tijdstip bereikt, vandaag nog niets ontvangen, vandaag nog niet gescand)
//  action "test" → alleen beheerder: nu een testbericht naar je eigen toestellen
// Dubbel sturen kan niet: last_sent wordt per toestel op vandaag gezet.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PUBLISHABLE_FALLBACK = "sb_publishable_vpOCr1D2DfYbpBEcAhdvSg_f1dcs5OA";
const ADMINS = (Deno.env.get("ADMIN_EMAILS") ?? "l.v.uuden3@gmail.com").toLowerCase().split(",").map((x) => x.trim());
const APP_URL = "https://lenvanuuden.github.io/VinedIt/";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Wisselt per week, zodat het bericht niet went
const MESSAGES = [
  "Het is weekend! 🍷 Vergeet niet je wijn te scannen.",
  "Wat zit er vanavond in je glas? Scan hem voor je album.",
  "Vrijdagmiddag, borrel in zicht 🥂 Scan je wijn en vul je album.",
  "Nieuw weekend, nieuwe kaart? Scan je wijn 🍷",
];

function amsNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`, weekday: p.weekday };
}
const amsDay = (iso: string) => amsNow(new Date(iso)).day;
function weekNo(day: string) {
  const d = new Date(day + "T12:00:00Z");
  return Math.floor((d.getTime() - Date.UTC(2026, 0, 2)) / (7 * 864e5));
}

async function keys(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.from("push_keys").select("public_key,private_key").eq("id", 1).maybeSingle();
  if (data) return data as { public_key: string; private_key: string };
  const k = webpush.generateVAPIDKeys();
  await admin.from("push_keys").upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: "id", ignoreDuplicates: true });
  const { data: again } = await admin.from("push_keys").select("public_key,private_key").eq("id", 1).single();
  return again as { public_key: string; private_key: string };
}

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string };

async function sendAll(admin: ReturnType<typeof createClient>, subs: Sub[], body: string, today: string | null) {
  const k = await keys(admin);
  webpush.setVapidDetails("mailto:l.v.uuden3@gmail.com", k.public_key, k.private_key);
  const payload = JSON.stringify({ title: "Vined It", body, url: APP_URL });
  let sent = 0, gone = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: "normal" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // Abonnement bestaat niet meer (app verwijderd, meldingen uitgezet): niet meer proberen
      if (code === 404 || code === 410) { gone++; await admin.from("push_subs").update({ enabled: false, updated_at: new Date().toISOString() }).eq("endpoint", s.endpoint); }
      else { failed++; console.error("push mislukt", code, (e as Error).message); }
    }
  }));
  if (today && subs.length) await admin.from("push_subs").update({ last_sent: today }).in("endpoint", subs.map((s) => s.endpoint));
  return { sent, gone, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));

    if (body.action === "key") {
      const k = await keys(admin);
      return json({ key: k.public_key });
    }

    if (body.action === "send") {
      const now = amsNow();
      if (now.weekday !== "Fri") return json({ status: "geen vrijdag" });
      const { data: due } = await admin.from("push_subs").select("endpoint,user_id,p256dh,auth,send_time,last_sent")
        .eq("enabled", true).lte("send_time", now.time + ":00").or(`last_sent.is.null,last_sent.lt.${now.day}`);
      if (!due?.length) return json({ status: "niemand aan de beurt" });
      // Wie vandaag al scande, krijgt niets (wel last_sent, zodat we het niet elk kwartier opnieuw bekijken)
      const users = [...new Set(due.map((s) => s.user_id))];
      const since = new Date(Date.now() - 30 * 3600e3).toISOString();
      const { data: cards } = await admin.from("cards").select("user_id,created_at").in("user_id", users).gte("created_at", since);
      const scanned = new Set((cards ?? []).filter((c) => amsDay(c.created_at) === now.day).map((c) => c.user_id));
      const send = due.filter((s) => !scanned.has(s.user_id)) as Sub[];
      const skip = due.filter((s) => scanned.has(s.user_id)).map((s) => s.endpoint);
      if (skip.length) await admin.from("push_subs").update({ last_sent: now.day }).in("endpoint", skip);
      const res = await sendAll(admin, send, MESSAGES[weekNo(now.day) % MESSAGES.length], now.day);
      return json({ status: "ok", skipped: skip.length, ...res });
    }

    if (body.action === "test") {
      const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? PUBLISHABLE_FALLBACK, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ status: "not_authenticated" }, 401);
      if (!ADMINS.includes((user.email ?? "").toLowerCase())) return json({ status: "forbidden" }, 403);
      const { data: subs } = await admin.from("push_subs").select("endpoint,user_id,p256dh,auth").eq("user_id", user.id).eq("enabled", true);
      if (!subs?.length) return json({ status: "geen toestel" });
      const n = Number.isInteger(body.msg) ? body.msg : weekNo(amsNow().day);
      const res = await sendAll(admin, subs as Sub[], MESSAGES[((n % MESSAGES.length) + MESSAGES.length) % MESSAGES.length], null);
      return json({ status: "ok", ...res });
    }

    return json({ status: "unknown_action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ status: "error" }, 500);
  }
});
