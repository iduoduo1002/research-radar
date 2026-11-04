"use strict";

// Pure, deterministic selection. These are metadata/keyword picks, not full-paper reviews.
const CATALOG_LIMIT = 400;
const CATALOG_TTL = 6 * 60 * 60 * 1000;
const CATALOG_SELECTION_VERSION = 2;
function sourceLimit(source, view = "latest") {
  if (Number.isInteger(source?.[view === "history" ? "historyLimit" : "latestLimit"])) return source[view === "history" ? "historyLimit" : "latestLimit"];
  if (view === "history" && ["journal", "focus"].includes(source?.kind)) return 100;
  return source?.kind === "focus" ? 100 : 20;
}
function catalogRange(years = 5, now = new Date()) {
  const end = new Date(now), start = new Date(now), archive = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - years);
  archive.setUTCMonth(archive.getUTCMonth() - 6);
  const iso = date => date.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), archiveEnd: iso(archive) };
}
function catalogIdentity(item) {
  return item.doi ? `doi:${String(item.doi).toLowerCase()}` : item.url || String(item.title).toLowerCase();
}
function catalogDeduplicate(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item?.title) return false;
    try { const u = new URL(item.url); if (u.protocol !== "https:" || u.username || u.password) return false; } catch (_) { return false; }
    const key = catalogIdentity(item);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function catalogScore(item, source) {
  const text = `${item.title || ""} ${item.abstract || ""}`;
  return (source.signals || []).reduce((sum, signal) =>
    sum + (new RegExp(signal.pattern, "i").test(text) ? signal.weight || 1 : 0), 0);
}
function citationBoost(item, now = new Date()) {
  if (!Number.isFinite(item.citationCount) || item.citationCount < 0) return 0;
  const year = Number(String(item.date || "").slice(0, 4));
  const age = year >= 1900 && year <= now.getUTCFullYear() ? Math.max(1, now.getUTCFullYear() - year + 1) : 5;
  return Math.min(10, 2 * Math.log1p(item.citationCount) / Math.sqrt(age));
}
function projectFit(item) { return Math.max(0, Number(item.relevance) || 0); }
function projectScore(item, now = new Date()) {
  // Project fit leads; age-adjusted citations break close calls without swamping domain evidence.
  return 5 * projectFit(item) + 8 * (item.seedScore || 0) +
    Math.min(8, item.relevance || 0) + citationBoost(item, now);
}
function catalogProjectTop(items, limit, range = {}, journalCap = Infinity, now = new Date()) {
  const ranked = catalogDeduplicate(items).filter(item =>
    (!range.start || item.date >= range.start) && (!range.end || item.date <= range.end) &&
    (item.relevance > 0 || item.seedScore > 0))
    .sort((a, b) => projectScore(b, now) - projectScore(a, now) ||
      (b.relevance || 0) - (a.relevance || 0) ||
      (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) || catalogIdentity(a).localeCompare(catalogIdentity(b)));
  const selected = [], selectedIds = new Set(), byJournal = new Map();
  for (const item of ranked) {
    const journal = item.journalId || item.journal || "unknown";
    if ((byJournal.get(journal) || 0) >= journalCap) continue;
    selected.push(item); selectedIds.add(catalogIdentity(item));
    byJournal.set(journal, (byJournal.get(journal) || 0) + 1);
    if (selected.length === limit) return selected;
  }
  for (const item of ranked) {
    if (selectedIds.has(catalogIdentity(item))) continue;
    selected.push(item);
    if (selected.length === limit) break;
  }
  return selected;
}
function catalogNewest(items) {
  return [...items].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) ||
    (b.relevance || 0) - (a.relevance || 0) || catalogIdentity(a).localeCompare(catalogIdentity(b)));
}
function catalogBalanced(pools, limit) {
  const offsets = pools.map(() => 0), result = [], seen = new Set();
  let progressed = true;
  while (result.length < limit && progressed) {
    progressed = false;
    for (let i = 0; i < pools.length && result.length < limit; i++) {
      while (offsets[i] < pools[i].length) {
        const item = pools[i][offsets[i]++], key = catalogIdentity(item);
        if (seen.has(key)) continue;
        seen.add(key); result.push(item); progressed = true; break;
      }
    }
  }
  return result;
}
function catalogHistorical(items, limit, range) {
  return catalogDeduplicate(items).filter(item => item.date && item.date.slice(0, 10) >= range.start &&
    item.date.slice(0, 10) <= range.archiveEnd)
    .sort((a, b) => (b.relevance || 0) - (a.relevance || 0) ||
      (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) || catalogIdentity(a).localeCompare(catalogIdentity(b)))
    .slice(0, limit);
}
function catalogIssues(items, limit = 20) {
  const groups = new Map();
  for (const item of items) {
    const volume = String(item.volume || ""), issue = String(item.issue || "");
    const key = volume ? JSON.stringify([volume, issue]) : "online";
    if (!groups.has(key)) groups.set(key, { key, label: volume ? `卷 ${volume}${issue ? ` · 期 ${issue}` : "（未提供期号）"}` : "Online First / 未编卷期", candidates: [] });
    groups.get(key).candidates.push(item);
  }
  return [...groups.values()].map(group => ({ key: group.key, label: group.label, available: group.candidates.length,
    date: catalogNewest(group.candidates)[0]?.date || "",
    items: [...group.candidates].sort((a, b) => (b.relevance || 0) - (a.relevance || 0) ||
      (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)).slice(0, limit) }))
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
}
function catalogBuild(rawItems, source, range, savedAt = Date.now()) {
  const candidates = catalogDeduplicate(rawItems).map(item => ({ ...item,
    relevance: catalogScore(item, source), journalId: source.id, journal: source.shortName || source.name,
    source: source.shortName || source.name, selectionLabel: "关键词初筛" }))
    .filter(item => (!source.signals?.length || item.relevance > 0) &&
      (!item.date || item.date.slice(0, 10) >= range.start && item.date.slice(0, 10) <= range.end));
  const limit = sourceLimit(source), newest = catalogNewest(candidates);
  return { savedAt, selectionVersion: CATALOG_SELECTION_VERSION, provider: source.provider, displayLimit: limit,
    historyLimit: sourceLimit(source, "history"), range, candidateCount: candidates.length,
    items: newest.slice(0, limit), historyItems: catalogHistorical(candidates, sourceLimit(source, "history"), range),
    catalogItems: newest.slice(0, CATALOG_LIMIT), issues: catalogIssues(candidates, 20) };
}
function catalogAggregate(results, source, range, savedAt = Date.now()) {
  const successful = results.filter(result => result.value);
  const errors = results.filter(result => result.error).map(result => result.error)
    .concat(successful.flatMap(result => result.value.partialErrors || []));
  if (!successful.length) throw new Error(`${results.length}刊检索均失败：${errors.join("；")}`);
  const limit = sourceLimit(source);
  const latest = catalogBalanced(successful.map(result => catalogNewest(result.value.catalogItems || result.value.items)), limit);
  const historyLimit = sourceLimit(source, "history");
  const history = catalogBalanced(successful.map(result => catalogHistorical(result.value.catalogItems || [], historyLimit, range)), historyLimit);
  return { savedAt, selectionVersion: CATALOG_SELECTION_VERSION, provider: "aggregate", displayLimit: limit, historyLimit, range, items: latest, historyItems: history,
    issues: [], partialErrors: errors, journalsAvailable: successful.length, journalsExpected: results.length };
}
function pubmedCatalogUrls(source, range, historical = false) {
  const dates = `("${range.start.replaceAll("-", "/")}"[Date - Publication] : "${(historical ? range.archiveEnd : range.end).replaceAll("-", "/")}"[Date - Publication])`;
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  url.search = new URLSearchParams({ db: "pubmed", term: `(${source.query}) AND ${dates}`,
    retmode: "json", retmax: "200", sort: historical ? "relevance" : "pub_date", tool: "ResearchRadar" }).toString();
  return url.href;
}
function pubmedFetchUrl(ids) {
  if (!ids.every(id => /^\d+$/.test(String(id)))) throw new Error("PubMed 返回了无效 PMID。");
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi");
  url.search = new URLSearchParams({ db: "pubmed", retmode: "xml", id: ids.join(","), tool: "ResearchRadar" }).toString();
  return url.href;
}
function pubmedNeighborUrl(pmid) {
  if (!/^\d+$/.test(String(pmid))) throw new Error("种子文献 PMID 无效。");
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi");
  url.search = new URLSearchParams({ dbfrom: "pubmed", db: "pubmed", id: String(pmid), cmd: "neighbor_score", retmode: "json", tool: "ResearchRadar" }).toString();
  return url.href;
}
function pubmedNeighborCandidates(linksets, seed, candidates) {
  const links = linksets?.linksets?.[0]?.linksetdbs?.find(group => group.linkname === "pubmed_pubmed")?.links || [];
  if (!Array.isArray(links)) throw new Error("PubMed 未返回关联文献列表。");
  const top = Number(links[0]?.score) || 1;
  for (const [rank, link] of links.slice(0, 80).entries()) {
    const pmid = String(link.id || "");
    if (!/^\d+$/.test(pmid) || pmid === String(seed.pmid)) continue;
    const found = candidates.get(pmid) || { pmid, seedScore: 0, relatedSeeds: [] };
    found.seedScore += Math.max(0, Number(link.score) || 0) / top / (1 + rank / 25);
    found.relatedSeeds.push(seed.referenceId);
    candidates.set(pmid, found);
  }
  return links.length;
}
function europePmcCitationUrl(pmids) {
  if (!pmids.length || pmids.length > 50 || !pmids.every(id => /^\d+$/.test(String(id)))) throw new Error("被引查询 PMID 列表无效。");
  const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  url.search = new URLSearchParams({ query: `(${pmids.map(id => `EXT_ID:${id}`).join(" OR ")}) AND SRC:MED`, format: "json", resultType: "core", pageSize: "100" }).toString();
  return url.href;
}
function crossrefCatalogUrl(source, range, historical = false) {
  const url = new URL(`https://api.crossref.org/journals/${source.issn}/works`);
  const params = { rows: "200", filter: `type:journal-article,from-pub-date:${range.start},until-pub-date:${historical ? range.archiveEnd : range.end}`,
    sort: historical && source.crossrefQuery ? "relevance" : "published", order: "desc" };
  if (source.crossrefQuery) params.query = source.crossrefQuery;
  url.search = new URLSearchParams(params).toString();
  return url.href;
}
function crossrefDate(work) {
  const dates = [work["published-online"], work["published-print"], work.published].map(value => value?.["date-parts"]?.[0])
    .filter(value => value?.length).map(value => value.map((v, i) => String(v).padStart(i ? 2 : 4, "0")).join("-"));
  return dates.sort()[0] || "";
}
module.exports = { CATALOG_LIMIT, CATALOG_TTL, CATALOG_SELECTION_VERSION, sourceLimit, catalogRange, catalogIdentity, catalogDeduplicate, catalogScore, citationBoost, projectFit, projectScore, catalogProjectTop, catalogNewest, catalogBalanced, catalogHistorical, catalogIssues, catalogBuild, catalogAggregate, pubmedCatalogUrls, pubmedFetchUrl, pubmedNeighborUrl, pubmedNeighborCandidates, europePmcCitationUrl, crossrefCatalogUrl, crossrefDate };
