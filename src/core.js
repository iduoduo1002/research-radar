"use strict";

const FEED_HOSTS = new Set([
  "pubmed.ncbi.nlm.nih.gov", "www.nature.com", "rss.arxiv.org",
  "connect.biorxiv.org", "eutils.ncbi.nlm.nih.gov", "api.crossref.org", "www.ebi.ac.uk"
]);
function safeLink(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch (_) { return null; }
}
function safeFeed(value) {
  const link = safeLink(value);
  if (!link) return null;
  const u = new URL(link);
  if (u.hostname === "eutils.ncbi.nlm.nih.gov" &&
      (!/^\/entrez\/eutils\/(esearch|efetch|elink)\.fcgi$/.test(u.pathname) || u.searchParams.get("db") !== "pubmed" ||
       u.pathname.endsWith("/elink.fcgi") && (u.searchParams.get("dbfrom") !== "pubmed" || u.searchParams.get("cmd") !== "neighbor_score"))) return null;
  if (u.hostname === "api.crossref.org" && !/^\/journals\/\d{4}-[\dXx]{4}(?:\/works)?$/.test(u.pathname)) return null;
  if (u.hostname === "www.ebi.ac.uk" &&
      (u.pathname !== "/europepmc/webservices/rest/search" || u.searchParams.get("format") !== "json")) return null;
  return FEED_HOSTS.has(u.hostname) && (!u.port || u.port === "443") ? link : null;
}
function withTimeout(promise, ms, label = "请求") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}超时，请重试。`)), ms);
    Promise.resolve(promise).then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}
class SerialQueue {
  constructor() { this.pending = new Map(); this.tail = Promise.resolve(); this.closed = false; }
  run(key, work) {
    if (this.closed) return Promise.reject(new Error("插件已停止。"));
    if (this.pending.has(key)) return this.pending.get(key);
    const result = this.tail.then(() => {
      if (this.closed) throw new Error("插件已停止。");
      return work();
    });
    this.pending.set(key, result);
    this.tail = result.then(() => undefined, () => undefined);
    result.then(() => this.pending.delete(key), () => this.pending.delete(key));
    return result;
  }
  close() { this.closed = true; }
}
function translationKey(title, abstract, model) {
  // Exact content is part of the key, so hash collisions cannot reuse a translation.
  return JSON.stringify([model, title, abstract]);
}
function publicationDate(value) {
  const text = String(value || "");
  const calendar = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (calendar) return `${calendar[1]}/${Number(calendar[2])}/${Number(calendar[3])}`;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleDateString("zh-CN", { timeZone: "UTC" }) : text;
}
function filterItemsByKeyword(items, filter) {
  if (!filter || filter.sourceId) return items;
  const pattern = new RegExp(filter.pattern, "i");
  return items.filter(item => pattern.test(filter.field === "source"
    ? String(item.source || "")
    : `${item.title || ""}\n${item.abstract || ""}`));
}
function validateConfig(config) {
  if (!config || config.version !== 1 || !Array.isArray(config.topics) || !config.topics.length)
    throw new Error("论文雷达配置需要 version: 1 和非空 topics。");
  if (config.lookbackYears !== undefined && (!Number.isInteger(config.lookbackYears) || config.lookbackYears < 1 || config.lookbackYears > 20))
    throw new Error("历史回溯年份需要为1至20的整数。");
  if (config.defaultView !== undefined && !["latest", "history"].includes(config.defaultView))
    throw new Error("默认浏览范围需要为 latest 或 history。");
  const ids = new Set();
  for (const topic of config.topics) {
    if (!topic || typeof topic.id !== "string" || !topic.id || ids.has(topic.id) ||
        typeof topic.label !== "string" || !Array.isArray(topic.sources) || !topic.sources.length)
      throw new Error("主题 ID 必须唯一，每个主题需要名称和订阅源。");
    ids.add(topic.id);
    if (topic.keywordFilters !== undefined) {
      const labels = String(topic.description || "").split("、").map(value => value.trim()).filter(Boolean);
      if (!Array.isArray(topic.keywordFilters) || topic.keywordFilters.length !== labels.length || labels.length > 12)
        throw new Error(`主题「${topic.label}」的关键词标签与筛选规则不一致。`);
      for (const [index, filter] of topic.keywordFilters.entries()) {
        if (!filter || filter.label !== labels[index] ||
            (filter.sourceId ? typeof filter.sourceId !== "string" || !filter.sourceId :
              typeof filter.pattern !== "string" || !filter.pattern || filter.pattern.length > 1024 || ![undefined, "source"].includes(filter.field)))
          throw new Error(`主题「${topic.label}」的关键词筛选规则无效。`);
        if (!filter.sourceId) try { new RegExp(filter.pattern, "i"); } catch (_) { throw new Error("关键词筛选正则无效。"); }
      }
    }
    const sourceIds = new Set();
    for (const source of topic.sources) {
      if (!source || typeof source.id !== "string" || !source.id || sourceIds.has(source.id) ||
          typeof source.name !== "string" || !safeFeed(source.url) ||
          !["journal", "focus", "preprint"].includes(source.kind))
        throw new Error(`主题「${topic.label}」含不支持或不安全的订阅源。`);
      sourceIds.add(source.id);
      if (source.provider && !["pubmed", "crossref", "aggregate", "seed"].includes(source.provider))
        throw new Error("未知的期刊检索提供方。");
      if (source.provider === "seed" && !source.seeds && (source.kind !== "focus" || typeof source.seedPath !== "string" ||
          source.seedPath.startsWith("/") || source.seedPath.split("/").includes("..") || !source.seedPath.endsWith(".json")))
        throw new Error("种子文献需要库内 JSON 相对路径。");
      if (source.provider === "pubmed" && (typeof source.query !== "string" || !source.query.trim()))
        throw new Error("PubMed 来源需要明确检索式。");
      if (source.provider === "crossref" && !/^\d{4}-[\dXx]{4}$/.test(source.issn || ""))
        throw new Error("Crossref 来源需要有效 ISSN。");
      if (source.signals && (!Array.isArray(source.signals) || source.signals.length > 30)) throw new Error("关键词规则超出范围。");
      for (const signal of source.signals || []) {
        if (typeof signal.pattern !== "string" || signal.pattern.length > 1024 || !Number.isFinite(signal.weight) || signal.weight <= 0)
          throw new Error("关键词规则无效。");
        try { new RegExp(signal.pattern, "i"); } catch (_) { throw new Error("关键词正则无效。"); }
      }
    }
    if ((topic.keywordFilters || []).some(filter => filter.sourceId && !topic.sources.some(source => source.id === filter.sourceId && source.provider === "seed")))
      throw new Error("种子文献标签未指向本主题有效来源。");
    for (const source of topic.sources.filter(value => value.provider === "aggregate")) {
      const journals = topic.sources.filter(value => value.kind === "journal");
      if (source.kind !== "focus" || !Array.isArray(source.journalIds) ||
          journals.length < 1 || journals.length > 30 || source.journalIds.length !== journals.length ||
          new Set(source.journalIds).size !== journals.length ||
          source.journalIds.some(id => !journals.some(value => value.id === id && ["pubmed", "crossref"].includes(value.provider))))
        throw new Error("专题精选必须引用本主题全部有效期刊来源（1–30刊）。");
    }
  }
  return config;
}
function excerptKind(text) {
  if (!text.trim()) return "missing";
  const t = text.trim();
  // Metadata snippets must not masquerade as scientific abstracts.
  if (/^Nature\s+(Methods|Chemistry|Biotechnology|Communications|Chemical Biology)\b/i.test(t) ||
      (/doi\s*[:：]?\s*10\./i.test(t) && t.length < 450 && !/\b(we|study|results|method|approach)\b/i.test(t)))
    return "snippet";
  return "abstract";
}
function paperIdentity(item) {
  const url = safeLink(item?.url);
  const title = String(item?.title || "").trim();
  if (!title || !url) throw new Error("论文需要有效标题与 HTTPS 原文链接。");
  const parsed = new URL(url);
  const pmid = parsed.hostname === "pubmed.ncbi.nlm.nih.gov"
    ? parsed.pathname.match(/^\/(\d+)\/?$/)?.[1] || "" : "";
  const candidate = String(item.doi || (["doi.org", "dx.doi.org"].includes(parsed.hostname) ? decodeURIComponent(parsed.pathname.slice(1)) : ""));
  const doi = /^10\.\d{4,9}\/\S+$/i.test(candidate) ? candidate : "";
  return { title, url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : url, doi, pmid };
}
function normalizedDoi(value) {
  const doi = String(value || "").trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, "").replace(/[\s.]+$/, "").toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : "";
}
function normalizedTitle(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
function zoteroPaperIndex(records) {
  const byDoi = new Map(), byTitle = new Map();
  for (const record of records) {
    const item = record?.data || record;
    if (!item || record?.deleted || item.deleted || ["attachment", "note", "annotation"].includes(item.itemType)) continue;
    const key = String(item.key || record.key || "");
    if (!/^[A-Z0-9]{8}$/i.test(key)) continue;
    const doi = normalizedDoi(item.DOI || item.doi);
    const title = normalizedTitle(item.title);
    const year = String(item.date || "").match(/\b(?:19|20)\d{2}\b/)?.[0] || "";
    const journal = normalizedTitle(item.publicationTitle || "");
    const match = { key, doi, title, year, journal };
    if (doi && !byDoi.has(doi)) byDoi.set(doi, match);
    if (title && year && journal) {
      const identity = JSON.stringify([title, year, journal]);
      if (!byTitle.has(identity)) byTitle.set(identity, []);
      byTitle.get(identity).push(match);
    }
  }
  return { byDoi, byTitle };
}
function findZoteroPaper(index, paper) {
  const doi = normalizedDoi(paper?.doi);
  if (doi && index.byDoi.has(doi)) return { ...index.byDoi.get(doi), basis: "DOI" };
  const title = normalizedTitle(paper?.title);
  const year = String(paper?.date || "").match(/\b(?:19|20)\d{2}\b/)?.[0] || "";
  const journal = normalizedTitle(paper?.source || paper?.journal);
  if (!title || !year || !journal) return null;
  const candidates = index.byTitle.get(JSON.stringify([title, year, journal])) || [];
  // A conflicting DOI is a different version; an ambiguous title match stays unmarked.
  const eligible = candidates.filter(item => !doi || !item.doi);
  return eligible.length === 1 ? { ...eligible[0], basis: "标题＋年份＋期刊" } : null;
}
function isArticlePdfAttachment(record) {
  const item = record?.data || record;
  if (!item || record?.deleted || item.deleted || item.itemType !== "attachment" || item.linkMode === "linked_url") return false;
  const title = String(item.title || ""), filename = String(item.filename || "");
  if (item.contentType !== "application/pdf" && !/\.pdf$/i.test(filename)) return false;
  if (/\b(?:supplement(?:ary|al)?|supporting information|appendix|additional file|SI)\b|补充(?:材料|信息|文件)|附录/i.test(`${title} ${filename}`)) return false;
  return true;
}
class PaperSelection {
  constructor() { this.selected = new Map(); }
  findKey(item) {
    const paper = paperIdentity(item);
    for (const [key, entry] of this.selected) {
      const other = paperIdentity(entry.item);
      if (paper.url === other.url || paper.doi && other.doi && paper.doi.toLowerCase() === other.doi.toLowerCase()) return key;
    }
    return null;
  }
  has(item) { try { return this.findKey(item) !== null; } catch (_) { return false; } }
  set(item, topic, journal, checked) {
    const paper = paperIdentity(item), found = this.findKey(item);
    if (!checked) { if (found !== null) this.selected.delete(found); return; }
    if (found !== null) return;
    const key = paper.doi ? `doi:${paper.doi.toLowerCase()}` : paper.url;
    this.selected.set(key, { key, item: { ...item, ...paper }, topic, journal });
  }
  remove(key) { this.selected.delete(key); }
  clear() { this.selected.clear(); }
  get size() { return this.selected.size; }
  entries() { return Array.from(this.selected.values(), entry => ({ ...entry, item: { ...entry.item } })); }
}
module.exports = { safeLink, safeFeed, withTimeout, SerialQueue, translationKey, publicationDate, filterItemsByKeyword, validateConfig, excerptKind, paperIdentity, PaperSelection, normalizedDoi, normalizedTitle, zoteroPaperIndex, findZoteroPaper, isArticlePdfAttachment };
