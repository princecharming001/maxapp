// The sample conversation shown on slides 6 and 7. Written in Max's voice
// (MAX_BIBLE.md §5): short, lowercase, blunt, warm, no emoji.
const CHAT = [
  { from: 'user', text: ["be honest. what's holding my face back?"] },
  { from: 'max', text: [
    "honestly? not your bones. your jaw's your best feature.",
    "it's skin and hair. redness + uneven texture are dragging your overall down, and the cut's hiding your forehead.",
    "skin: cleanser, moisturizer, spf every morning. adapalene 2 nights a week from week 2.",
    "hair: mid taper, texture on top. tell your barber exactly that.",
    "both are in your plan now. first task is 7:30am tomorrow.",
  ] },
  { from: 'user', text: ['what about my jaw?'], read: 'Read 7:13 PM' },
  { from: 'max', text: [
    "lean out first. at your body fat a few % down will show more jaw than any mewing ever will.",
    "i added fitmax. 3 lifts a week + daily steps.",
  ] },
];

function renderChat(el, { header = true } = {}) {
  const parts = [];
  if (header) {
    parts.push(`<div class="chat-head"><div class="avatar"></div><div class="name">Max</div><div class="time">Today 7:12 PM</div></div>`);
  }
  for (const m of CHAT) {
    parts.push(`<div class="msg ${m.from}">${m.text.map((t) => `<p>${t}</p>`).join('')}</div>`);
    if (m.read) parts.push(`<div class="read">${m.read}</div>`);
  }
  el.innerHTML = parts.join('');
}

document.querySelectorAll('[data-chat]').forEach((el) => renderChat(el, { header: el.dataset.chat !== 'noheader' }));
