package handler

import (
	"encoding/xml"
	"net/http"
)

type sitemapURL struct {
	Location string `xml:"loc"`
}

type sitemap struct {
	XMLName xml.Name     `xml:"urlset"`
	XMLNS   string       `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

func (h *Handler) Sitemap(w http.ResponseWriter, r *http.Request) {
	paths, err := h.library.SitemapPaths(r.Context())
	if err != nil {
		respond(w, nil, err)
		return
	}
	base := h.siteBaseURL
	if base == "" {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		// Forwarded headers are not trusted. TLS-terminating deployments should
		// explicitly configure SITE_BASE_URL with their public HTTPS origin.
		base = scheme + "://" + r.Host
	}
	doc := sitemap{XMLNS: "http://www.sitemaps.org/schemas/sitemap/0.9"}
	for _, path := range paths {
		doc.URLs = append(doc.URLs, sitemapURL{Location: base + path})
	}
	// Fail rather than serving an invalid/truncated sitemap if the MVP catalog
	// outgrows a single sitemap; a sitemap index is needed beyond this limit.
	if len(doc.URLs) > 50000 {
		Fail(w, http.StatusServiceUnavailable, "站点地图超过单文件上限")
		return
	}
	data, err := xml.MarshalIndent(doc, "", "  ")
	if err != nil {
		Fail(w, http.StatusInternalServerError, "暂时无法生成站点地图")
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(append([]byte(xml.Header), data...))
}
