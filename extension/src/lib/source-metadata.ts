function readMetaByName(name: string) {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content?.trim() || "";
}

function readMetaByProperty(name: string) {
  return document.querySelector<HTMLMetaElement>(`meta[property="${name}"]`)?.content?.trim() || "";
}

function firstNonEmpty(values: Array<string | undefined | null>) {
  return values.find((value) => Boolean(value && value.trim()))?.trim() || "";
}

function parseAuthors(raw: string) {
  return raw
    .split(/,|;|\band\b/gi)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function extractSourceMetadata(pageTitle: string, pageUrl: string) {
  const title = firstNonEmpty([
    readMetaByProperty("og:title"),
    readMetaByName("citation_title"),
    readMetaByName("dc.title"),
    pageTitle,
  ]);

  const abstract = firstNonEmpty([
    readMetaByName("description"),
    readMetaByName("dc.description"),
    readMetaByName("citation_abstract"),
  ]);

  const authorRaw = firstNonEmpty([
    readMetaByName("citation_author"),
    readMetaByName("author"),
    readMetaByName("dc.creator"),
  ]);

  const doi = firstNonEmpty([
    readMetaByName("citation_doi"),
    readMetaByName("dc.identifier"),
  ]);

  const venue = firstNonEmpty([
    readMetaByName("citation_journal_title"),
    readMetaByName("citation_conference_title"),
    readMetaByName("og:site_name"),
  ]);

  const publicationYearRaw = firstNonEmpty([
    readMetaByName("citation_publication_date"),
    readMetaByName("citation_date"),
    readMetaByName("dc.date"),
  ]);
  const publicationYear = Number.parseInt(publicationYearRaw.slice(0, 4), 10);

  const sourceType = pageUrl.toLowerCase().endsWith(".pdf") ? "paper" : "web";

  return {
    sourceType,
    title,
    url: pageUrl,
    abstract: abstract || null,
    authors: authorRaw ? parseAuthors(authorRaw) : [],
    publicationYear: Number.isFinite(publicationYear) ? publicationYear : null,
    venue: venue || null,
    doi: doi || null,
    paperNumber: null,
    metadata: {
      extractedAt: new Date().toISOString(),
      extractor: "extension-meta-v1",
      meta: {
        ogTitle: readMetaByProperty("og:title") || null,
        twitterTitle: readMetaByName("twitter:title") || null,
      },
    },
  };
}
