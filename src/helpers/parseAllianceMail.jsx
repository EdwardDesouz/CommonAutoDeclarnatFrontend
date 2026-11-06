function toText(s = "") {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\r/g, "");
}

const FIELDS = [
  ["exporter", /^exporter$/],
  ["gross", /^(total )?gross (wt|weight)/],
  ["pack", /^(total )?outer pack/],
  ["value", /^value$/],
  ["port_of_discharge", /^port of discharge/],
  ["country_of_final_destination", /^country of final destination/],
  ["outward_transport_id", /^ou(?:t|tward)?\s*transport identifier/],
  ["conveyance_reference_no", /^conveyance reference/],
  ["outward_carrier_agent", /^outward carrier agent/],
  ["obl_mawb_ucr_no", /^(obl|mawb|ucr)/],
  ["departure_date", /^(date of )?departure|^etd/],
  ["place_of_receipt", /^(place of )?receipt/],
  ["container", /^container\b/],
  ["seal", /^seal\b/],
];

// strip quote markers (> ) from replied/forwarded mails
const cleanLine = (raw) => raw.replace(/^[>\s]+/, "").trim();
const normLabel = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");

// segment-la irukkura known fields count
function fieldScore(lines) {
  let n = 0;
  for (const line of lines) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    if (FIELDS.some(([, re]) => re.test(normLabel(line.slice(0, i))))) n++;
  }
  return n;
}

// Thread-la irundhu data irukkura MUDHAL (latest) message mattum
export function getNewestMessage(body) {
  const lines = toText(body).split("\n").map(cleanLine);
  const segs = [[]];

  for (const line of lines) {
    const isBoundary =
      /^from:\s*\S/i.test(line) ||
      /^-{2,}\s*original message\s*-{2,}/i.test(line) ||
      /^_{5,}$/.test(line) ||
      /^on .{5,150} wrote:$/i.test(line);
    if (isBoundary) segs.push([]);
    segs[segs.length - 1].push(line);
  }

  const scored = segs.map((s) => ({ lines: s, score: fieldScore(s) }));
  const best =
    scored.find((s) => s.score >= 3) ||
    scored.reduce((a, b) => (b.score > a.score ? b : a), scored[0]);

  if (!best || best.score === 0) return lines.join("\n"); // fallback: muzhu text
  return best.lines.join("\n");
}

function splitQty(str = "") {
  const c = str.trim().match(/^(\d+)\s*x\s*(\d{2})\s*([A-Za-z']*)/i);
  if (c) {
    return {
      value: c[1],
      unit: "",
      container_size: `${c[2]}${(c[3] || "").toUpperCase()}`,
    };
  }
  const m = str.trim().match(/^([\d.,]+)\s*([A-Za-z]+)?/);
  return m
    ? { value: m[1].replace(/,/g, ""), unit: (m[2] || "").toUpperCase() }
    : { value: "", unit: "" };
}

const list = (v, sep) =>
  v.split(sep).map((s) => s.trim().toUpperCase()).filter(Boolean);
const uniq = (arr) => [...new Set(arr)];

export function parseAllianceMail(body) {
  const out = { other: {} };
  const loose = [];
  const conflicts = [];

  // Same label twice: same value is fine, different value is a conflict
  const put = (key, value) => {
    if (out[key] && out[key] !== value) conflicts.push(key);
    out[key] = value;
  };

  // latest message mattum parse pannum
  for (const raw of getNewestMessage(body).split("\n")) {
    const line = cleanLine(raw);
    if (!line) continue;

    const i = line.indexOf(":");
    if (i < 1) {
      loose.push(line);
      continue;
    }

    const label = normLabel(line.slice(0, i));
    const value = line.slice(i + 1).trim();
    if (!value) continue;

    const hit = FIELDS.find(([, re]) => re.test(label));
    if (!hit) {
      out.other[label] = value;
      continue;
    }

    const key = hit[0];
    if (key === "gross") {
      const q = splitQty(value);
      put("total_gross_weight", q.value);
      put("total_gross_weight_unit", q.unit);
    } else if (key === "pack") {
      const q = splitQty(value);
      put("total_outer_pack", q.value);
      put("total_outer_pack_unit", q.unit);
      if (q.container_size) out.container_size = q.container_size;
    } else if (key === "value") {
      const m = value.match(/([A-Z]{3})\s*\$?\s*([\d.,]+)/i);
      put("currency", m ? m[1].toUpperCase() : "");
      put("value", m ? m[2].replace(/,/g, "") : value);
    } else if (key === "container") {
      out.container_numbers = uniq([
        ...(out.container_numbers || []),
        ...list(value, /[,;\s]+/),
      ]);
    } else if (key === "seal") {
      out.seal_numbers = uniq([
        ...(out.seal_numbers || []),
        ...list(value, /[,;]+/),
      ]);
    } else {
      put(key, value);
    }
  }

  if (loose.length) out.other.loose = uniq(loose);
  if (conflicts.length) out.conflicts = uniq(conflicts);
  return out;
}