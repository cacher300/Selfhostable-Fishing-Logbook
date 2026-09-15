function wikiTopics() {
  return [...document.querySelectorAll("[data-wiki-topic]")];
}

function setWikiTopicsOpen(open) {
  wikiTopics().forEach((topic) => {
    topic.open = open;
  });
}

function filterWikiTopics() {
  const query = String(document.querySelector("#wikiSearch")?.value || "").trim().toLocaleLowerCase();
  const topics = wikiTopics();
  let matches = 0;
  topics.forEach((topic) => {
    const matchesTopic = !query || topic.textContent.toLocaleLowerCase().includes(query);
    topic.classList.toggle("hidden", !matchesTopic);
    if (matchesTopic) {
      matches += 1;
      if (query) topic.open = true;
    }
  });
  const empty = document.querySelector("#wikiEmpty");
  const status = document.querySelector("#wikiSearchStatus");
  empty?.classList.toggle("hidden", matches !== 0);
  if (status) status.textContent = query ? `${matches} topic${matches === 1 ? "" : "s"} found for “${query}”.` : "";
}

document.querySelector("#wikiSearch")?.addEventListener("input", filterWikiTopics);
document.querySelector("#wikiExpandAllButton")?.addEventListener("click", () => setWikiTopicsOpen(true));
document.querySelector("#wikiCollapseAllButton")?.addEventListener("click", () => setWikiTopicsOpen(false));
