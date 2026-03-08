let bookmarkTree = [];
let annotationsMap = {};
let selectedFolderId = null;
let selectedBookmarkId = null;
let isSearchActive = false;

// DOM elements
const folderTreeEl = document.getElementById("folder-tree");
const tbodyEl = document.getElementById("bookmark-tbody");
const searchInput = document.getElementById("search-input");
const detailEmpty = document.getElementById("detail-empty");
const detailForm = document.getElementById("detail-form");
const detailName = document.getElementById("detail-name");
const detailUrl = document.getElementById("detail-url");
const detailTags = document.getElementById("detail-tags");
const detailDesc = document.getElementById("detail-desc");
const detailSave = document.getElementById("detail-save");
const detailStatus = document.getElementById("detail-status");

// ── Initialization ──

async function init() {
  const [tree, annotations] = await Promise.all([
    browser.bookmarks.getTree(),
    getAllAnnotations()
  ]);
  bookmarkTree = tree;
  annotationsMap = annotations;

  renderFolderTree();
  setupSearch();
  setupDetailPanel();
}

// ── Folder Tree ──

function renderFolderTree() {
  folderTreeEl.innerHTML = "";
  const root = bookmarkTree[0];
  if (root && root.children) {
    for (const child of root.children) {
      renderFolderNode(child, folderTreeEl, 0);
    }
  }
}

function renderFolderNode(node, parentEl, depth) {
  if (node.type === "separator" || node.url) return;

  const item = document.createElement("div");
  item.className = "folder-item";
  item.dataset.id = node.id;
  item.style.paddingLeft = (8 + depth * 16) + "px";

  const hasChildren = node.children && node.children.some(c => !c.url && c.type !== "separator");

  const arrow = document.createElement("span");
  arrow.className = "folder-arrow";
  arrow.textContent = hasChildren ? "\u25B6" : "";
  item.appendChild(arrow);

  const label = document.createElement("span");
  label.className = "folder-label";
  label.textContent = node.title || "(untitled)";
  item.appendChild(label);

  parentEl.appendChild(item);

  const childContainer = document.createElement("div");
  childContainer.className = "folder-children collapsed";
  parentEl.appendChild(childContainer);

  item.addEventListener("click", (e) => {
    e.stopPropagation();
    selectFolder(node.id, node);

    if (hasChildren) {
      const isExpanded = !childContainer.classList.contains("collapsed");
      childContainer.classList.toggle("collapsed");
      arrow.textContent = isExpanded ? "\u25B6" : "\u25BC";
    }
  });

  if (node.children) {
    for (const child of node.children) {
      renderFolderNode(child, childContainer, depth + 1);
    }
  }

  // Auto-select first folder
  if (!selectedFolderId) {
    selectFolder(node.id, node);
  }
}

function selectFolder(folderId, node) {
  selectedFolderId = folderId;
  isSearchActive = false;
  searchInput.value = "";

  document.querySelectorAll(".folder-item.selected").forEach(el => el.classList.remove("selected"));
  const folderEl = folderTreeEl.querySelector(`.folder-item[data-id="${folderId}"]`);
  if (folderEl) folderEl.classList.add("selected");

  const bookmarks = getBookmarksInFolder(node || findNodeById(bookmarkTree[0], folderId));
  renderTable(bookmarks);
  clearDetailPanel();
}

function findNodeById(node, id) {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

function getBookmarksInFolder(folderNode) {
  if (!folderNode || !folderNode.children) return [];
  return folderNode.children.filter(c => c.url && c.type !== "separator");
}

// ── Table View ──

function renderTable(bookmarks) {
  tbodyEl.innerHTML = "";
  for (const bm of bookmarks) {
    const annotation = annotationsMap[bm.id] || { description: "", tags: [] };
    const row = document.createElement("tr");
    row.dataset.id = bm.id;

    const nameCell = createCell(bm.title || "", "name", bm.id);
    const urlCell = createCell(bm.url || "", "url", bm.id);
    const tagsCell = createCell((annotation.tags || []).join(", "), "tags", bm.id);
    const descCell = createCell(annotation.description || "", "desc", bm.id);

    row.appendChild(nameCell);
    row.appendChild(urlCell);
    row.appendChild(tagsCell);
    row.appendChild(descCell);

    row.addEventListener("click", () => {
      selectBookmarkRow(bm.id);
    });

    tbodyEl.appendChild(row);
  }
}

function createCell(text, field, bookmarkId) {
  const td = document.createElement("td");
  td.className = `col-${field}`;
  td.textContent = text;
  td.dataset.field = field;
  td.dataset.bookmarkId = bookmarkId;

  td.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    startInlineEdit(td, field, bookmarkId);
  });

  return td;
}

function selectBookmarkRow(bookmarkId) {
  selectedBookmarkId = bookmarkId;

  document.querySelectorAll("#bookmark-tbody tr.selected").forEach(el => el.classList.remove("selected"));
  const row = tbodyEl.querySelector(`tr[data-id="${bookmarkId}"]`);
  if (row) row.classList.add("selected");

  populateDetailPanel(bookmarkId);
}

// ── Inline Editing ──

function startInlineEdit(td, field, bookmarkId) {
  if (td.querySelector("input, textarea")) return;

  const currentText = td.textContent;
  td.textContent = "";

  const isDesc = field === "desc";
  const input = document.createElement(isDesc ? "textarea" : "input");
  if (!isDesc) input.type = "text";
  input.className = "inline-edit";
  input.value = currentText;
  td.appendChild(input);
  input.focus();
  input.select();

  const commit = async () => {
    const newValue = input.value;
    td.textContent = newValue;
    await saveFieldChange(bookmarkId, field, newValue);
    // Update detail panel if this bookmark is selected
    if (selectedBookmarkId === bookmarkId) {
      populateDetailPanel(bookmarkId);
    }
  };

  const cancel = () => {
    td.textContent = currentText;
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !isDesc) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener("blur", () => {
    if (td.contains(input)) {
      commit();
    }
  });
}

async function saveFieldChange(bookmarkId, field, value) {
  if (field === "name") {
    await browser.bookmarks.update(bookmarkId, { title: value });
    updateTreeNodeTitle(bookmarkId, value);
  } else if (field === "url") {
    await browser.bookmarks.update(bookmarkId, { url: value });
  } else if (field === "tags") {
    const tags = value.split(",").map(t => t.trim()).filter(Boolean);
    const existing = annotationsMap[bookmarkId] || { description: "", tags: [] };
    existing.tags = tags;
    existing.bookmarkId = bookmarkId;
    annotationsMap[bookmarkId] = existing;
    await saveAnnotation(bookmarkId, { description: existing.description, tags });
  } else if (field === "desc") {
    const existing = annotationsMap[bookmarkId] || { description: "", tags: [] };
    existing.description = value;
    existing.bookmarkId = bookmarkId;
    annotationsMap[bookmarkId] = existing;
    await saveAnnotation(bookmarkId, { description: value, tags: existing.tags });
  }
}

function updateTreeNodeTitle(bookmarkId, newTitle) {
  const node = findNodeById(bookmarkTree[0], bookmarkId);
  if (node) node.title = newTitle;
}

// ── Detail Panel ──

function setupDetailPanel() {
  detailSave.addEventListener("click", saveDetailPanel);
}

function clearDetailPanel() {
  selectedBookmarkId = null;
  detailForm.classList.add("hidden");
  detailEmpty.classList.remove("hidden");
}

async function populateDetailPanel(bookmarkId) {
  const node = findNodeById(bookmarkTree[0], bookmarkId);
  if (!node) return;

  const annotation = annotationsMap[bookmarkId] || { description: "", tags: [] };

  detailName.value = node.title || "";
  detailUrl.value = node.url || "";
  detailTags.value = (annotation.tags || []).join(", ");
  detailDesc.value = annotation.description || "";

  detailEmpty.classList.add("hidden");
  detailForm.classList.remove("hidden");
  detailStatus.textContent = "";
}

async function saveDetailPanel() {
  if (!selectedBookmarkId) return;

  const bookmarkId = selectedBookmarkId;
  const title = detailName.value;
  const url = detailUrl.value;
  const tagsStr = detailTags.value;
  const description = detailDesc.value;
  const tags = tagsStr.split(",").map(t => t.trim()).filter(Boolean);

  try {
    await browser.bookmarks.update(bookmarkId, { title, url });
    updateTreeNodeTitle(bookmarkId, title);

    annotationsMap[bookmarkId] = { bookmarkId, description, tags };
    await saveAnnotation(bookmarkId, { description, tags });

    // Update the table row
    const row = tbodyEl.querySelector(`tr[data-id="${bookmarkId}"]`);
    if (row) {
      const cells = row.querySelectorAll("td");
      cells[0].textContent = title;
      cells[1].textContent = url;
      cells[2].textContent = tags.join(", ");
      cells[3].textContent = description;
    }

    detailStatus.textContent = "Saved!";
    detailStatus.className = "status-success";
    setTimeout(() => { detailStatus.textContent = ""; }, 2000);
  } catch (err) {
    detailStatus.textContent = "Error: " + err.message;
    detailStatus.className = "status-error";
  }
}

// ── Search ──

function setupSearch() {
  let debounceTimer = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const query = searchInput.value.trim();
      if (query) {
        performSearch(query);
      } else {
        // Return to folder view
        if (selectedFolderId) {
          const node = findNodeById(bookmarkTree[0], selectedFolderId);
          if (node) {
            isSearchActive = false;
            const bookmarks = getBookmarksInFolder(node);
            renderTable(bookmarks);
          }
        }
      }
    }, 300);
  });
}

async function performSearch(query) {
  isSearchActive = true;
  const results = await browser.bookmarks.search(query);
  const bookmarksOnly = results.filter(r => r.url);
  renderTable(bookmarksOnly);
  clearDetailPanel();
}

// ── Start ──

init();
