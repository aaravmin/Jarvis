// demo/seed/seed.mjs
//
// Seeds the "Brown Bee Coffee" demo dataset into the demo account for the Jarvis demo video.
// Imports @supabase/supabase-js from the app's own node_modules (no separate npm install needed).
// Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from ../../.env.local by parsing
// the file directly (never prints the values). All writes go through the anon key AS THE SIGNED-IN
// DEMO USER, so Row-Level Security scopes every insert/delete to that user's own rows.
//
// Usage: node demo/seed/seed.mjs
//
// Idempotent: if the demo account already exists, signs in and wipes its prior items / goal_links /
// goals / sources before re-seeding, so reruns produce a clean, identical dataset.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const ENV_PATH = path.join(REPO_ROOT, ".env.local");

const DEMO_EMAIL = "demo.driftwood.jarvis@gmail.com";
const DEMO_PASSWORD = "DriftwoodDemo!2026";

const DAY_MS = 86_400_000;
const NOW = new Date(); // captured once; every seeded date is relative to this instant

function daysAgo(n) {
  return new Date(NOW.getTime() - n * DAY_MS);
}
function daysFromNow(n) {
  return new Date(NOW.getTime() + n * DAY_MS);
}
/** Same calendar day as (now +/- n days), at a specific local hour:minute. */
function atLocalTime(baseDate, hour, minute = 0) {
  const d = new Date(baseDate);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function iso(d) {
  return d.toISOString();
}

function readEnvVar(name) {
  const text = fs.readFileSync(ENV_PATH, "utf8");
  const re = new RegExp(`^${name}=(.*)$`, "m");
  const m = text.match(re);
  if (!m) throw new Error(`Missing ${name} in .env.local`);
  const value = m[1].trim();
  if (!value) throw new Error(`Empty ${name} in .env.local`);
  return value;
}

function fail(message) {
  console.error(`\nFATAL: ${message}\n`);
  process.exit(1);
}

async function main() {
  const SUPABASE_URL = readEnvVar("NEXT_PUBLIC_SUPABASE_URL");
  const SUPABASE_ANON_KEY = readEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // ---------------------------------------------------------------------
  // 1) Sign up (or sign in if the account already exists).
  // ---------------------------------------------------------------------
  console.log(`Signing up ${DEMO_EMAIL} ...`);
  const signUpRes = await supabase.auth.signUp({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

  let session = null;
  let userId = null;

  if (signUpRes.error) {
    const msg = signUpRes.error.message || "";
    if (/already registered|already exists|user_already_exists/i.test(msg)) {
      console.log("Account already exists (signUp reported it). Signing in instead...");
      const signInRes = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
      if (signInRes.error) fail(`signIn failed after signUp said user exists: ${signInRes.error.message}`);
      session = signInRes.data.session;
      userId = signInRes.data.user?.id ?? null;
    } else {
      fail(`signUp failed unexpectedly: ${msg}`);
    }
  } else if (signUpRes.data.session) {
    session = signUpRes.data.session;
    userId = signUpRes.data.user?.id ?? null;
    console.log("Signed up with an immediate session (email confirmation not required on this project).");
  } else if (signUpRes.data.user && Array.isArray(signUpRes.data.user.identities) && signUpRes.data.user.identities.length === 0) {
    // Supabase's anti-enumeration behavior: signUp for an existing (confirmed) email returns a user
    // object with no session and an empty identities array instead of an explicit error.
    console.log("Account already exists (obfuscated signUp response). Signing in instead...");
    const signInRes = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (signInRes.error) fail(`signIn failed after obfuscated signUp: ${signInRes.error.message}`);
    session = signInRes.data.session;
    userId = signInRes.data.user?.id ?? null;
  } else {
    fail(
      "CONFIRMATION REQUIRED: signUp succeeded but returned no session (email confirmation is required " +
        "on this Supabase project for new accounts). Per the task instructions, STOPPING here rather than " +
        "trying to bypass it. The coordinator needs to either confirm the demo account's email (Supabase " +
        "dashboard -> Authentication -> Users -> confirm), or disable email confirmation for this project, " +
        "then this script can be re-run.",
    );
  }

  if (!session || !userId) fail("No session/userId after auth flow (unexpected).");
  console.log(`Signed in. user_id=${userId}`);

  // ---------------------------------------------------------------------
  // 2) Preflight: verify migrations 0022 (parent_goal_id) and 0024 (thread state) are applied.
  //    (0021's widened source_type check is verified implicitly when we insert the notion sources
  //    below; if that check constraint is missing it will fail with Postgres code 23514 there.)
  // ---------------------------------------------------------------------
  console.log("Preflight: checking migrations 0022 and 0024 columns...");
  const missingColumns = [];

  const goalsHierarchyCheck = await supabase.from("goals").select("parent_goal_id").limit(1);
  if (goalsHierarchyCheck.error) {
    if (goalsHierarchyCheck.error.code === "42703") missingColumns.push("goals.parent_goal_id (migration 0022_goal_hierarchy.sql)");
    else fail(`Unexpected error checking goals.parent_goal_id: ${goalsHierarchyCheck.error.message}`);
  }

  const threadStateCheck = await supabase.from("sources").select("thread_id, last_msg_from, last_msg_at").limit(1);
  if (threadStateCheck.error) {
    if (threadStateCheck.error.code === "42703")
      missingColumns.push("sources.thread_id/last_msg_from/last_msg_at (migration 0024_thread_state.sql)");
    else fail(`Unexpected error checking sources thread-state columns: ${threadStateCheck.error.message}`);
  }

  if (missingColumns.length) {
    fail(
      `Required migration columns are missing, cannot seed a dataset the Today feed can read:\n` +
        missingColumns.map((c) => `  - ${c}`).join("\n") +
        `\nApply the listed migration(s) in the Supabase SQL editor, then re-run this script.`,
    );
  }
  console.log("Preflight OK: 0022 and 0024 columns present.");

  // ---------------------------------------------------------------------
  // 3) Wipe this user's prior seeded rows (idempotent reruns). RLS scopes deletes to this user only;
  //    the explicit .eq("user_id", userId) is belt-and-suspenders on top of that.
  // ---------------------------------------------------------------------
  console.log("Wiping prior rows for this user (items, goal_links, goals, sources)...");
  for (const table of ["items", "goal_links", "goals", "sources"]) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) fail(`Failed wiping table ${table}: ${error.message}`);
  }
  console.log("Wipe complete.");

  // =======================================================================
  // 4) GOALS
  // =======================================================================
  console.log("Inserting goals...");
  const ids = { sources: {}, goals: {}, items: {} };

  async function insertGoal(key, fields) {
    const { data, error } = await supabase
      .from("goals")
      .insert({ user_id: userId, created_by: "user", review_status: "accepted", ...fields })
      .select("id")
      .single();
    if (error) fail(`Insert goal ${key} failed: ${error.message}`);
    ids.goals[key] = data.id;
  }

  await insertGoal("G1", { title: "Grow wholesale revenue", description: "From 12 to 30 wholesale accounts by December." });
  await insertGoal("G1a", {
    title: "Land 10 new cafe accounts",
    description: "Focus: Providence + Boston.",
    parent_goal_id: ids.goals.G1,
  });
  await insertGoal("G1b", {
    title: "Launch a coffee subscription",
    description: "Monthly boxes, 200 subscribers year one.",
    parent_goal_id: ids.goals.G1,
  });
  await insertGoal("G2", { title: "Keep roastery operations tight", description: "No stockouts, on-time supplier payments." });

  // =======================================================================
  // 5) SOURCES
  // =======================================================================
  console.log("Inserting sources...");

  async function insertSource(key, fields) {
    const { data, error } = await supabase
      .from("sources")
      .insert({ user_id: userId, ...fields })
      .select("id, raw_text")
      .single();
    if (error) {
      if (error.code === "23514" && fields.source_type === "notion") {
        fail(
          "Migration 0021_notion_sources.sql does not appear to be applied: inserting a source with " +
            `source_type='notion' violated the sources_source_type_check constraint (${error.message}). ` +
            "Apply 0021 in the Supabase SQL editor, then re-run.",
        );
      }
      fail(`Insert source ${key} failed: ${error.message}`);
    }
    ids.sources[key] = data.id;
    return data;
  }

  // ---- Email sources ----------------------------------------------------
  const e1RawText =
    "Could you send over wholesale pricing for the fall blends? We want to get Brown Bee on the menu by September. " +
    "Also, are you still able to do a cupping with us this week so we can taste the new blends together?";
  await insertSource("E1", {
    source_type: "email",
    title: "Wholesale order + fall menu",
    from_name: "Sam Okafor",
    from_email: "sam@ferncafe.com",
    group_label: "Fern Cafe",
    permalink: "https://mail.google.com/mail/u/0/#inbox",
    occurred_at: iso(daysAgo(4)),
    raw_text: e1RawText,
    thread_id: "th-fern-1",
    last_msg_from: "them",
    last_msg_at: iso(daysAgo(4)),
  });

  const e2RawText =
    "Thanks for the tasting session last week. Loved the Guatemala. Let me talk to my team about volumes " +
    "and I will circle back with what we can commit to for the fall menu.";
  await insertSource("E2", {
    source_type: "email",
    title: "Tasting follow-up",
    from_name: "Priya Shah",
    from_email: "priya@hobartst.com",
    group_label: "Hobart St Bakery",
    permalink: "https://mail.google.com/mail/u/0/#inbox",
    occurred_at: iso(daysAgo(6)),
    raw_text: e2RawText,
    thread_id: "th-hobart-1",
    last_msg_from: "me",
    last_msg_at: iso(daysAgo(5)),
  });

  const e3RawText =
    "Invoice #2841 for the Huila lot is due July 10. Terms are net 30 from delivery. Let us know if you " +
    "need the packing list resent.";
  await insertSource("E3", {
    source_type: "email",
    title: "Invoice #2841 - net 30",
    from_name: "Cascadia Green Coffee Importers",
    from_email: "billing@cascadiagreencoffee.com",
    group_label: "Cascadia Green Coffee Importers",
    permalink: "https://mail.google.com/mail/u/0/#inbox",
    occurred_at: iso(daysAgo(12)),
    raw_text: e3RawText,
    thread_id: "th-cascadia-1",
    last_msg_from: "them",
    last_msg_at: iso(daysAgo(12)),
  });

  const e4RawText =
    "The Probat needs its quarterly service before the 25th, I can take Friday if that works for the roast " +
    "schedule. Let me know and I will book the tech.";
  await insertSource("E4", {
    source_type: "email",
    title: "Roaster maintenance window",
    from_name: "Jonah",
    from_email: "jonah@brownbeecoffee.com",
    group_label: "Brown Bee Coffee",
    permalink: "https://mail.google.com/mail/u/0/#inbox",
    occurred_at: iso(daysAgo(2)),
    raw_text: e4RawText,
    thread_id: "th-jonah-1",
    last_msg_from: "them",
    last_msg_at: iso(daysAgo(2)),
  });

  const e5RawText =
    "Hi Brown Bee team, your booth for the Lippitt Park farmers market is confirmed for this month. " +
    "Please arrive by 8am to set up and bring your own tent weights.";
  await insertSource("E5", {
    source_type: "email",
    title: "Farmers market - booth confirmation",
    from_name: "Providence Farmers Market Collective",
    from_email: "info@pvdfarmersmarket.org",
    group_label: "Providence Farmers Market Collective",
    permalink: "https://mail.google.com/mail/u/0/#inbox",
    occurred_at: iso(daysAgo(9)),
    raw_text: e5RawText,
  });

  const e6RawText =
    "Attached is our quote for 12oz kraft bags with valve, three options depending on order volume. Let us " +
    "know if you would like a sample pack before you decide.";
  await insertSource("E6", {
    source_type: "email",
    title: "Packaging quote - kraft bags",
    from_name: "Providence Packaging Co",
    from_email: "sales@providencepackaging.com",
    group_label: "Providence Packaging Co",
    permalink: "https://mail.google.com/mail/u/0/#inbox",
    occurred_at: iso(daysAgo(8)),
    raw_text: e6RawText,
  });

  // ---- Calendar sources ---------------------------------------------------
  await insertSource("C1", {
    source_type: "calendar",
    title: "Cupping with Fern Cafe",
    permalink: "https://calendar.google.com",
    occurred_at: iso(atLocalTime(NOW, 15, 0)),
    ends_at: iso(atLocalTime(NOW, 16, 0)),
    is_all_day: false,
    raw_text: "127 Westminster St, Providence, RI",
  });

  await insertSource("C2", {
    source_type: "calendar",
    title: "Production planning sync",
    permalink: "https://calendar.google.com",
    occurred_at: iso(atLocalTime(daysFromNow(1), 9, 0)),
    ends_at: iso(atLocalTime(daysFromNow(1), 9, 30)),
    is_all_day: false,
    raw_text: null,
  });

  await insertSource("C3", {
    source_type: "calendar",
    title: "Farmers market - Lippitt Park",
    permalink: "https://calendar.google.com",
    occurred_at: iso(atLocalTime(daysFromNow(3), 12, 0)),
    ends_at: iso(atLocalTime(daysFromNow(4), 12, 0)),
    is_all_day: true,
    raw_text: "Lippitt Park, Providence, RI",
  });

  await insertSource("C4", {
    source_type: "calendar",
    title: "Cascadia payment due",
    permalink: "https://calendar.google.com",
    occurred_at: iso(atLocalTime(daysFromNow(1), 12, 0)),
    ends_at: iso(atLocalTime(daysFromNow(2), 12, 0)),
    is_all_day: true,
    raw_text: null,
  });

  // ---- Notion sources -----------------------------------------------------
  const n1RawText =
    "Production sync - Jul 8. Attendees: Maya, Jonah. Decision: raise wholesale minimum to 20 lbs. " +
    "This keeps small one-off orders from eating roast capacity. Maya to draft the September subscription " +
    "launch plan by July 21.";
  await insertSource("N1", {
    source_type: "notion",
    title: "Production sync - Jul 8",
    permalink: "https://notion.so/demo",
    occurred_at: iso(daysAgo(6)),
    raw_text: n1RawText,
  });

  const n2RawText =
    "Wholesale pipeline. Fern Cafe wants pricing this week - biggest near-term account. Hobart St Bakery " +
    "tasted the Guatemala and is checking volumes internally. Two more Providence cafes on the long list " +
    "for outreach next month.";
  await insertSource("N2", {
    source_type: "notion",
    title: "Wholesale pipeline",
    permalink: "https://notion.so/demo",
    occurred_at: iso(daysAgo(2)),
    raw_text: n2RawText,
  });

  // ---- Meeting source -------------------------------------------------------
  const m1RawText =
    "Team standup transcript. Jonah: I'll handle the Probat service booking. Maya: I owe Sam pricing today. " +
    "Jonah: sounds good, I'll ping you once the tech confirms Friday.";
  await insertSource("M1", {
    source_type: "meeting",
    title: "Team standup transcript",
    permalink: "https://calendar.google.com",
    occurred_at: iso(NOW),
    raw_text: m1RawText,
  });

  // =======================================================================
  // 6) ITEMS + GOAL_LINKS
  // =======================================================================
  console.log("Inserting items and goal links...");

  async function insertItem(key, fields) {
    const { data, error } = await supabase
      .from("items")
      .insert({ user_id: userId, created_by: "jarvis", status: "accepted", ...fields })
      .select("id")
      .single();
    if (error) fail(`Insert item ${key} failed: ${error.message}`);
    ids.items[key] = data.id;
    return data.id;
  }

  async function insertGoalLink(entityType, entityId, goalId, reviewStatus, rationale) {
    const { error } = await supabase.from("goal_links").insert({
      user_id: userId,
      goal_id: goalId,
      entity_type: entityType,
      entity_id: entityId,
      review_status: reviewStatus,
      created_by: "jarvis",
      rationale,
      confidence: 0.8,
    });
    if (error) fail(`Insert goal_link (${entityType}:${entityId} -> ${goalId}) failed: ${error.message}`);
  }

  function assertSubstring(sourceKey, rawText, quote) {
    if (!rawText.includes(quote)) {
      fail(`Quote provenance broken: "${quote}" is not a substring of ${sourceKey}'s raw_text.`);
    }
  }

  // ---- A1: overdue task, from E3 -----------------------------------------
  {
    const quote = "Invoice #2841 for the Huila lot is due July 10.";
    assertSubstring("E3", e3RawText, quote);
    const id = await insertItem("A1", {
      item_type: "task",
      title: "Pay Cascadia invoice #2841",
      due_at: iso(daysAgo(3)),
      status: "accepted",
      confidence: 0.85,
      source_id: ids.sources.E3,
      source_quote: quote,
      reasoning: "Invoice due date is in the past and unpaid.",
    });
    await insertGoalLink("item", id, ids.goals.G2, "accepted", "Keeps supplier payments on time.");
  }

  // ---- A2: due today task, from E1 ---------------------------------------
  {
    const quote = "Could you send over wholesale pricing for the fall blends? We want to get Brown Bee on the menu by September.";
    assertSubstring("E1", e1RawText, quote);
    const id = await insertItem("A2", {
      item_type: "task",
      title: "Send wholesale pricing to Fern Cafe",
      due_at: iso(NOW),
      status: "accepted",
      confidence: 0.82,
      source_id: ids.sources.E1,
      source_quote: quote,
      reasoning: "Sam is asking for fall pricing to finalize the menu.",
    });
    await insertGoalLink("item", id, ids.goals.G1a, "accepted", "Fern Cafe is a live cafe-account opportunity.");
  }

  // ---- A3: due +7 days task, from N1 --------------------------------------
  {
    const quote = "Maya to draft the September subscription launch plan by July 21.";
    assertSubstring("N1", n1RawText, quote);
    const id = await insertItem("A3", {
      item_type: "task",
      title: "Draft September subscription launch plan",
      due_at: iso(daysFromNow(7)),
      status: "accepted",
      confidence: 0.78,
      source_id: ids.sources.N1,
      source_quote: quote,
      reasoning: "Production sync assigned this to Maya with a due date.",
    });
    await insertGoalLink("item", id, ids.goals.G1b, "accepted", "Directly advances the subscription launch.");
  }

  // ---- A4: due +4 days task, from E4 --------------------------------------
  {
    const quote = "The Probat needs its quarterly service before the 25th, I can take Friday if that works for the roast schedule.";
    assertSubstring("E4", e4RawText, quote);
    const id = await insertItem("A4", {
      item_type: "task",
      title: "Book Probat quarterly service",
      due_at: iso(daysFromNow(4)),
      status: "accepted",
      confidence: 0.8,
      source_id: ids.sources.E4,
      source_quote: quote,
      reasoning: "Jonah flagged the service window and offered Friday.",
    });
    await insertGoalLink("item", id, ids.goals.G2, "accepted", "Equipment uptime keeps roasting on schedule.");
  }

  // ---- A5: done task, from E5 ----------------------------------------------
  {
    const quote = "your booth for the Lippitt Park farmers market is confirmed for this month.";
    assertSubstring("E5", e5RawText, quote);
    await insertItem("A5", {
      item_type: "task",
      title: "Confirm farmers market booth",
      due_at: iso(daysAgo(1)),
      status: "done",
      confidence: 0.75,
      source_id: ids.sources.E5,
      source_quote: quote,
      reasoning: "Booth confirmation email received and actioned.",
    });
  }

  // ---- R1: review task, from N1 ---------------------------------------------
  {
    const quote = "Decision: raise wholesale minimum to 20 lbs.";
    assertSubstring("N1", n1RawText, quote);
    const id = await insertItem("R1", {
      item_type: "task",
      title: "Raise wholesale minimum to 20 lbs on the order form",
      status: "review",
      confidence: 0.83,
      source_id: ids.sources.N1,
      source_quote: quote,
      reasoning: "Production sync recorded this as a decision to action.",
    });
    await insertGoalLink("item", id, ids.goals.G1, "review", "Wholesale minimums shape wholesale revenue growth.");
  }

  // ---- R2: review event, from E1 (cupping quote) -----------------------------
  {
    const quote = "Also, are you still able to do a cupping with us this week so we can taste the new blends together?";
    assertSubstring("E1", e1RawText, quote);
    await insertItem("R2", {
      item_type: "event",
      title: "Cupping with Fern Cafe",
      due_at: iso(atLocalTime(NOW, 15, 0)),
      status: "review",
      confidence: 0.72,
      source_id: ids.sources.E1,
      source_quote: quote,
      reasoning: "Sam asked to schedule a cupping in the same email as the pricing request.",
    });
  }

  // ---- R3: review follow_up, from E2 ------------------------------------------
  {
    const quote = "Let me talk to my team about volumes";
    assertSubstring("E2", e2RawText, quote);
    const id = await insertItem("R3", {
      item_type: "follow_up",
      title: "Check volumes decision with Priya's team",
      status: "review",
      confidence: 0.74,
      source_id: ids.sources.E2,
      source_quote: quote,
      reasoning: "Priya said she'd check internally on volumes; worth a nudge if silent.",
    });
    await insertGoalLink("item", id, ids.goals.G1a, "review", "Hobart St Bakery is a candidate new cafe account.");
  }

  // ---- R4: review task, from E6 ------------------------------------------------
  {
    const quote = "Attached is our quote for 12oz kraft bags with valve, three options depending on order volume.";
    assertSubstring("E6", e6RawText, quote);
    await insertItem("R4", {
      item_type: "task",
      title: "Get packaging quote comparison",
      status: "review",
      confidence: 0.7,
      source_id: ids.sources.E6,
      source_quote: quote,
      reasoning: "Vendor sent a quote worth comparing against current packaging costs.",
    });
  }

  console.log("All inserts complete.");

  // =======================================================================
  // 7) VERIFY
  // =======================================================================
  console.log("\n=== VERIFICATION ===\n");

  const results = {};

  async function countTable(table) {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (error) fail(`Count failed for ${table}: ${error.message}`);
    return count;
  }

  results.counts = {
    sources: await countTable("sources"),
    goals: await countTable("goals"),
    goal_links: await countTable("goal_links"),
    items: await countTable("items"),
  };

  console.log("Row counts:", results.counts);

  // Simulate the Today feed's reply-entry logic (lib/priority/load.ts loadReplyEntries + score.ts).
  const REPLY_OVERDUE_DAYS = 3;
  const replyRes = await supabase
    .from("sources")
    .select("id, title, thread_id, last_msg_from, last_msg_at")
    .eq("user_id", userId)
    .eq("source_type", "email")
    .not("last_msg_from", "is", null);
  if (replyRes.error) fail(`Reply-feed simulation query failed: ${replyRes.error.message}`);

  const nowForVerify = new Date();
  const replySim = replyRes.data.map((r) => {
    const ageDays = Math.max(0, Math.floor((nowForVerify.getTime() - new Date(r.last_msg_at).getTime()) / DAY_MS));
    const kind = r.last_msg_from === "them" ? "needs_reply" : "waiting_on";
    const bucket = kind === "needs_reply" ? (ageDays >= REPLY_OVERDUE_DAYS ? "overdue" : "today") : "today";
    const surfaced = kind === "needs_reply" || ageDays >= REPLY_OVERDUE_DAYS;
    return { thread_id: r.thread_id, title: r.title, kind, ageDays, bucket, surfaced };
  });
  console.log("\nReply-feed simulation (all email sources with thread state):");
  for (const r of replySim) console.log(`  ${r.thread_id} (${r.title}): kind=${r.kind} ageDays=${r.ageDays} bucket=${r.bucket} surfaced=${r.surfaced}`);

  const e1Sim = replySim.find((r) => r.thread_id === "th-fern-1");
  const e2Sim = replySim.find((r) => r.thread_id === "th-hobart-1");
  results.e1_needs_reply_overdue = !!e1Sim && e1Sim.kind === "needs_reply" && e1Sim.bucket === "overdue" && e1Sim.surfaced;
  results.e2_waiting_on_surfaced = !!e2Sim && e2Sim.kind === "waiting_on" && e2Sim.ageDays >= REPLY_OVERDUE_DAYS && e2Sim.surfaced;

  // A1 overdue check: due_at in the past (by calendar day).
  const a1Res = await supabase.from("items").select("id, due_at, status").eq("id", ids.items.A1).single();
  if (a1Res.error) fail(`A1 verify query failed: ${a1Res.error.message}`);
  const startOfToday = new Date(nowForVerify);
  startOfToday.setHours(0, 0, 0, 0);
  results.a1_overdue = new Date(a1Res.data.due_at).getTime() < startOfToday.getTime() && a1Res.data.status === "accepted";

  console.log("\nSanity checks:");
  console.log(`  E1 surfaces as overdue needs_reply (Sam, 4 days): ${results.e1_needs_reply_overdue ? "PASS" : "FAIL"}`);
  console.log(`  E2 surfaces as waiting_on (Priya, >=3 days silent): ${results.e2_waiting_on_surfaced ? "PASS" : "FAIL"}`);
  console.log(`  A1 is overdue (due_at in the past, accepted): ${results.a1_overdue ? "PASS" : "FAIL"}`);

  console.log("\n=== IDS ===");
  console.log(JSON.stringify({ user_id: userId, sources: ids.sources, goals: ids.goals, items: ids.items }, null, 2));

  console.log("\n=== SUMMARY_JSON_START ===");
  console.log(
    JSON.stringify(
      {
        user_id: userId,
        counts: results.counts,
        checks: {
          e1_needs_reply_overdue: results.e1_needs_reply_overdue,
          e2_waiting_on_surfaced: results.e2_waiting_on_surfaced,
          a1_overdue: results.a1_overdue,
        },
        ids,
      },
      null,
      2,
    ),
  );
  console.log("=== SUMMARY_JSON_END ===");

  if (!results.e1_needs_reply_overdue || !results.e2_waiting_on_surfaced || !results.a1_overdue) {
    console.error("\nOne or more sanity checks FAILED. Review the output above.");
    process.exit(1);
  }

  console.log("\nSeed complete. All sanity checks PASS.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
