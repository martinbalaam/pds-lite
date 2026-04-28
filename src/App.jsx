import { useEffect, useMemo, useRef, useState } from "react";
import { brands, defaultTemplates, products, staticItems } from "./data.js";
import { extractBrandGuideline } from "./brandGuidelines.js";

const storageKey = "pds-lite-react-templates";
const brandStorageKey = "pds-lite-brands";
const pimSettingsStorageKey = "pds-lite-pim-settings";
const pimProductsStorageKey = "pds-lite-pim-products";
const pimChannelsStorageKey = "pds-lite-pim-channels";
const pageNumberSelectionId = "__pageNumbers";
const appPassword = "Martial16210!";
const sessionUnlockKey = "pds-lite-session-unlocked";

function loadSessionUnlock() {
  return window.sessionStorage.getItem(sessionUnlockKey) === "true";
}

function loadBrands() {
  const saved = window.localStorage.getItem(brandStorageKey);
  if (!saved) return structuredClone(brands);

  try {
    return JSON.parse(saved);
  } catch {
    return structuredClone(brands);
  }
}

function saveBrands(nextBrands) {
  window.localStorage.setItem(brandStorageKey, JSON.stringify(nextBrands));
}

function loadTemplates() {
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultTemplates);

  try {
    return JSON.parse(saved);
  } catch {
    return structuredClone(defaultTemplates);
  }
}

function saveTemplates(templates) {
  window.localStorage.setItem(storageKey, JSON.stringify(templates));
}

function loadPimSettings() {
  const saved = window.localStorage.getItem(pimSettingsStorageKey);
  if (!saved) return { apiFeedKey: "", baseUrl: "", productsPath: "", selectedChannelId: "" };

  try {
    return { apiFeedKey: "", baseUrl: "", productsPath: "", selectedChannelId: "", ...JSON.parse(saved) };
  } catch {
    return { apiFeedKey: "", baseUrl: "", productsPath: "", selectedChannelId: "" };
  }
}

function savePimSettings(settings) {
  window.localStorage.setItem(pimSettingsStorageKey, JSON.stringify(settings));
}

function loadPimProducts() {
  const saved = window.localStorage.getItem(pimProductsStorageKey);
  if (!saved) return [];

  try {
    return JSON.parse(saved);
  } catch {
    return [];
  }
}

function savePimProducts(nextProducts) {
  window.localStorage.setItem(pimProductsStorageKey, JSON.stringify(nextProducts));
}

function loadPimChannels() {
  const saved = window.localStorage.getItem(pimChannelsStorageKey);
  if (!saved) return [];

  try {
    return JSON.parse(saved);
  } catch {
    return [];
  }
}

function savePimChannels(nextChannels) {
  window.localStorage.setItem(pimChannelsStorageKey, JSON.stringify(nextChannels));
}

function normalizePublicPdfUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `${window.location.protocol}${value}`;
  if (value.startsWith("/")) return `${window.location.origin}${value}`;
  return `https://${value}`;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(loadSessionUnlock);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [brandLibrary, setBrandLibrary] = useState(loadBrands);
  const [templates, setTemplates] = useState(loadTemplates);
  const [pimSettings, setPimSettings] = useState(loadPimSettings);
  const [pimProducts, setPimProducts] = useState(loadPimProducts);
  const [pimChannels, setPimChannels] = useState(loadPimChannels);
  const [pimProductSource, setPimProductSource] = useState({ accountName: "", channelName: "" });
  const activeProducts = pimProducts.length ? pimProducts : products;
  const [selectedTemplateId, setSelectedTemplateId] = useState(defaultTemplates[0].id);
  const [selectedProductId, setSelectedProductId] = useState(activeProducts[0].id);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [selectedFieldIds, setSelectedFieldIds] = useState([]);
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [productSearch, setProductSearch] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [workspaceZoom, setWorkspaceZoom] = useState(1);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [pimStatus, setPimStatus] = useState({ type: "idle", message: pimProducts.length ? `${pimProducts.length} PIM products loaded` : "Using demo products" });
  const [pimLastRequest, setPimLastRequest] = useState(null);
  const [generatedPdf, setGeneratedPdf] = useState(null);
  const [pdfStatus, setPdfStatus] = useState({ type: "idle", message: "" });
  const lastChannelFetchKeyRef = useRef("");

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? templates[0],
    [selectedTemplateId, templates],
  );
  const selectedProduct = activeProducts.find((product) => product.id === selectedProductId) ?? activeProducts[0] ?? products[0];
  const selectedBrand = brandLibrary.find((brand) => brand.id === selectedTemplate.brandId) ?? brandLibrary[0];
  const selectedChannel = pimChannels.find((channel) => String(channel.id) === String(pimSettings.selectedChannelId)) || null;
  const selectedElement = selectedTemplate.elements.find((element) => element.id === selectedElementId);
  const isPageNumberSelected = selectedElementId === pageNumberSelectionId;
  const dynamicItems = getProductFieldItems(selectedProduct);
  const templatePages = getTemplatePages(selectedTemplate);
  const productSourceInfo = getProductSourceInfo(selectedProduct, pimProductSource);

  const visibleProducts = activeProducts.filter((product) => {
    const query = productSearch.trim().toLowerCase();
    const haystack = `${product.id} ${product.name} ${product.category}`.toLowerCase();
    return haystack.includes(query);
  });

  useEffect(() => {
    const feedKey = pimSettings.apiFeedKey?.trim() || "";
    if (!feedKey) {
      lastChannelFetchKeyRef.current = "";
      if (pimChannels.length || pimSettings.selectedChannelId) {
        setPimChannels([]);
        savePimChannels([]);
        setPimSettings((current) => {
          const next = { ...current, selectedChannelId: "" };
          savePimSettings(next);
          return next;
        });
      }
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (lastChannelFetchKeyRef.current === feedKey) return;
      lastChannelFetchKeyRef.current = feedKey;
      getPimChannels(feedKey);
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [pimChannels.length, pimSettings.apiFeedKey, pimSettings.selectedChannelId]);

  function updatePimSettings(patch) {
    setPimSettings((current) => {
      const next = { ...current, ...patch };
      savePimSettings(next);
      return next;
    });
  }

  function unlockApp(event) {
    event.preventDefault();
    if (passwordInput === appPassword) {
      window.sessionStorage.setItem(sessionUnlockKey, "true");
      setIsAuthenticated(true);
      setPasswordError("");
      setPasswordInput("");
      return;
    }
    setPasswordError("Password not recognised.");
  }

  if (!isAuthenticated) {
    return (
      <main className="password-gate">
        <section className="password-card">
          <p className="eyebrow">PDS Lite</p>
          <h1>Password Required</h1>
          <p className="password-copy">Enter the startup password to open the template builder.</p>
          <form className="password-form" onSubmit={unlockApp}>
            <label>
              Password
              <input
                autoFocus
                type="password"
                value={passwordInput}
                onChange={(event) => {
                  setPasswordInput(event.target.value);
                  if (passwordError) setPasswordError("");
                }}
              />
            </label>
            {passwordError && <div className="password-error">{passwordError}</div>}
            <button className="primary-action" type="submit">
              Unlock
            </button>
          </form>
        </section>
      </main>
    );
  }

  async function generatePdf() {
    setPdfStatus({ type: "loading", message: "Generating PDF..." });
    try {
      persistCurrentTemplate();
      const renderRoot = document.getElementById("pdfRenderRoot");
      if (!renderRoot) throw new Error("PDF render surface not available.");

      const page = pageDimensions(selectedTemplate.page);
      const response = await fetch("/api/pdf/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: selectedBrand,
          fileName: pdfFileName(selectedProduct.id),
          page,
          product: selectedProduct,
          template: selectedTemplate,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not generate the PDF.");

      setGeneratedPdf({
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        url: normalizePublicPdfUrl(payload.publicUrl),
      });
      setPdfStatus({
        type: "success",
        message: `PDF generated and stored by the server${payload.fileSize ? ` (${formatBytes(payload.fileSize)})` : ""}. The URL below can be copied or opened directly.`,
      });
    } catch (error) {
      setPdfStatus({ type: "error", message: error?.message || "Could not generate the PDF." });
    }
  }

  async function copyGeneratedPdfUrl() {
    if (!generatedPdf?.url) return;
    try {
      await navigator.clipboard.writeText(generatedPdf.url);
      setPdfStatus({
        type: "success",
        message: "PDF URL copied. This browser URL works locally in this session; a public upload endpoint is still needed for the PIM.",
      });
    } catch {
      setPdfStatus({ type: "error", message: "Could not copy the PDF URL from this browser." });
    }
  }

  async function uploadGeneratedPdfToPim() {
    if (!generatedPdf?.fileName) return;
    if (!pimSettings.apiFeedKey?.trim()) {
      setPdfStatus({ type: "error", message: "API Feed Key is required before uploading a PDF to PIM." });
      return;
    }

    setPdfStatus({ type: "loading", message: "Uploading PDF to PIM..." });
    try {
      const response = await fetch("/api/pim/upload-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiFeedKey: pimSettings.apiFeedKey.trim(),
          fileName: generatedPdf.fileName,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not upload the PDF to PIM.");

      setPdfStatus({
        type: "success",
        message: payload?.message || "PDF uploaded to PIM successfully.",
      });
    } catch (error) {
      setPdfStatus({ type: "error", message: error?.message || "Could not upload the PDF to PIM." });
    }
  }

  async function testPimConnection() {
    setPimStatus({ type: "loading", message: "Testing PIM access..." });
    try {
      const request = pimRequestDetails({
        apiKey: selectedChannel?.token,
        apiKeyLabel: "Selected channel token",
        baseUrl: pimSettings.baseUrl,
        path: pimSettings.productsPath,
      });
      setPimLastRequest(request.diagnostics);
      const response = await fetch(request.url, request.options);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText || "Request failed"}`);
      setPimStatus({ type: "success", message: "PIM products GET access confirmed." });
    } catch (error) {
      setPimStatus({ type: "error", message: pimErrorMessage(error) });
    }
  }

  async function getPimChannels(feedKeyOverride) {
    const apiFeedKey = feedKeyOverride?.trim() || pimSettings.apiFeedKey?.trim() || "";
    if (!apiFeedKey) return;

    setPimStatus({ type: "loading", message: "Loading channels from PIM..." });
    try {
      const request = pimRequestDetails({
        apiKey: apiFeedKey,
        apiKeyLabel: "API Feed Key",
        baseUrl: "https://indigo.pimberly.com",
        path: "/api/channels",
      });
      setPimLastRequest(request.diagnostics);
      const response = await fetch(request.url, request.options);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText || "Request failed"}`);
      const payload = await response.json();
      const nextChannels = normalizePimChannels(payload);
      if (!nextChannels.length) throw new Error("The PIM response did not contain any channels.");
      setPimChannels(nextChannels);
      savePimChannels(nextChannels);
      const selectableChannels = nextChannels.filter((channel) => channel.isApiChannel && channel.token);
      const existingSelection = selectableChannels.find((channel) => String(channel.id) === String(pimSettings.selectedChannelId));
      updatePimSettings({ selectedChannelId: String((existingSelection || selectableChannels[0] || {}).id || "") });
      setPimStatus({
        type: "success",
        message: `${nextChannels.length} channels loaded from PIM. ${selectableChannels.length} API channel${selectableChannels.length === 1 ? "" : "s"} available.`,
      });
    } catch (error) {
      setPimStatus({ type: "error", message: pimErrorMessage(error) });
    }
  }

  async function getPimProducts() {
    setPimStatus({ type: "loading", message: "Running JSON GET for products..." });
    try {
      const request = pimRequestDetails({
        apiKey: selectedChannel?.token,
        apiKeyLabel: "Selected channel token",
        baseUrl: pimSettings.baseUrl,
        path: pimSettings.productsPath,
      });
      setPimLastRequest(request.diagnostics);
      const response = await fetch(request.url, request.options);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText || "Request failed"}`);
      const payload = await response.json();
      setPimProductSource(extractProductSourceInfo(payload));
      const nextProducts = normalizePimProducts(payload);
      if (!nextProducts.length) throw new Error("The PIM response did not contain a product list.");
      setPimProducts(nextProducts);
      savePimProducts(nextProducts);
      setSelectedProductId(nextProducts[0].id);
      setSelectedFieldIds([]);
      setPimStatus({ type: "success", message: `${nextProducts.length} products loaded from PIM.` });
    } catch (error) {
      setPimStatus({ type: "error", message: pimErrorMessage(error) });
    }
  }

  function clearPimProducts() {
    const confirmed = window.confirm("Clear all cached PIM products? The product list will return to the demo products.");
    if (!confirmed) return;

    setPimProducts([]);
    setPimProductSource({ accountName: "", channelName: "" });
    savePimProducts([]);
    setSelectedProductId(products[0].id);
    setSelectedFieldIds([]);
    setPimStatus({ type: "idle", message: "Cached PIM products cleared. Using demo products." });
  }

  function updateTemplates(updater, persist = false) {
    setTemplates((current) => {
      const next = updater(structuredClone(current));
      if (persist) saveTemplates(next);
      return next;
    });
  }

  function updateTemplate(patch) {
    updateTemplates((current) =>
      current.map((template) => (template.id === selectedTemplateId ? { ...template, ...patch } : template)),
    );
  }

  function updatePageNumbers(patch) {
    updateTemplate({
      pageNumbers: {
        ...defaultPageNumbers(selectedTemplate),
        ...patch,
      },
    });
  }

  function setPageNumberMode(mode) {
    const existingPageNumbers = defaultPageNumbers(selectedTemplate);
    updatePageNumbers({
      mode,
      color: selectedTemplate.pageNumbers?.color || existingPageNumbers.color,
    });
    setSelectedElementId(mode === "none" ? null : pageNumberSelectionId);
  }

  function updateBrands(updater) {
    setBrandLibrary((current) => {
      const next = updater(structuredClone(current));
      saveBrands(next);
      return next;
    });
  }

  function addBrand() {
    const brand = {
      id: `brand-${Date.now()}`,
      name: "New brand",
      headingFont: "Inter",
      bodyFont: "Inter",
      colors: [],
      logo: "",
      logos: [],
      guidelines: [],
      toneRules: [],
    };
    updateBrands((current) => [...current, brand]);
    updateTemplate({ brandId: brand.id });
  }

  function changeTemplateBrand(brandId) {
    const brand = brandLibrary.find((item) => item.id === brandId);
    updateTemplates((current) =>
      current.map((template) => {
        if (template.id !== selectedTemplateId) return template;
        const nextTemplate = { ...template, brandId };
        return remapTemplateColors(nextTemplate, brand?.colors || []);
      }),
    );
  }

  function updateBrand(brandId, patch) {
    updateBrands((current) => current.map((brand) => (brand.id === brandId ? { ...brand, ...patch } : brand)));
  }

  function deleteBrand(brandId) {
    if (brandLibrary.length <= 1) {
      window.alert("At least one brand must remain.");
      return;
    }

    const brand = brandLibrary.find((item) => item.id === brandId);
    const confirmed = window.confirm(
      `Delete ${brand?.name || "this brand"}? Existing templates assigned to this brand will remain in the template library and can be deleted separately.`,
    );
    if (!confirmed) return;

    const fallbackBrand = brandLibrary.find((item) => item.id !== brandId);
    updateBrands((current) => current.filter((item) => item.id !== brandId));
    if (selectedTemplate.brandId === brandId && fallbackBrand) {
      updateTemplate({ brandId: fallbackBrand.id });
    }
  }

  async function uploadBrandLogo(brandId, file) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateBrands((current) =>
      current.map((brand) => {
        if (brand.id !== brandId) return brand;
        const logo = { id: `logo-${Date.now()}`, name: file.name, dataUrl };
        return { ...brand, logo: brand.logo || dataUrl, logos: [...(brand.logos || []), logo] };
      }),
    );
  }

  async function uploadBrandGuideline(brandId, file) {
    if (!file) return;
    try {
      const guideline = await extractBrandGuideline(file);
      updateBrands((current) =>
        current.map((brand) => {
          if (brand.id !== brandId) return brand;
          return mergeGuidelineIntoBrand(brand, guideline);
        }),
      );
      if (guideline.colors.length > 0) {
        updateTemplates((current) =>
          current.map((template) =>
            template.brandId === brandId ? remapTemplateColors(template, guideline.colors) : template,
          ),
        );
      }
    } catch (error) {
      window.alert(`Could not read ${file.name}. Please try another PDF, DOCX, PPTX, or TXT file.`);
    }
  }

  function updateSelectedElement(patch) {
    updateTemplates((current) =>
      current.map((template) => {
        if (template.id !== selectedTemplateId) return template;
        return {
          ...template,
          elements: template.elements.map((element) =>
            element.id === selectedElementId ? { ...element, ...patch } : element,
          ),
        };
      }),
    );
  }

  function persistCurrentTemplate() {
    saveTemplates(templates);
  }

  function cloneTemplate() {
    const copy = structuredClone(selectedTemplate);
    copy.id = `tpl-${Date.now()}`;
    copy.name = `${selectedTemplate.name} copy`;
    copy.elements = copy.elements.map((element) => ({ ...element, id: `el-${Date.now()}-${Math.random()}` }));
    const nextTemplates = [...templates, copy];
    setTemplates(nextTemplates);
    saveTemplates(nextTemplates);
    setSelectedTemplateId(copy.id);
    setSelectedElementId(null);
  }

  function newTemplate() {
    const template = {
      ...createBlankTemplate(),
      brandId: selectedBrand?.id || brandLibrary[0]?.id || "voltedge",
    };
    const nextTemplates = [...templates, template];
    setTemplates(nextTemplates);
    saveTemplates(nextTemplates);
    setSelectedTemplateId(template.id);
    setSelectedElementId(null);
  }

  function deleteSelectedTemplate() {
    const confirmed = window.confirm(
      `Delete template "${selectedTemplate.name}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    const remainingTemplates = templates.filter((template) => template.id !== selectedTemplateId);
    const nextTemplates = remainingTemplates.length
      ? remainingTemplates
      : [{ ...createBlankTemplate(), brandId: selectedBrand?.id || brandLibrary[0]?.id || "voltedge" }];
    const nextSelectedTemplate = nextTemplates[0];

    setTemplates(nextTemplates);
    saveTemplates(nextTemplates);
    setSelectedTemplateId(nextSelectedTemplate.id);
    setSelectedElementId(null);
    setSelectedPageIndex(0);
  }

  function deleteSelectedElement() {
    updateTemplates((current) =>
      current.map((template) => {
        if (template.id !== selectedTemplateId) return template;
        return {
          ...template,
          elements: template.elements.filter((element) => element.id !== selectedElementId),
        };
      }),
    );
    setSelectedElementId(null);
  }

  function clearTemplateElementsExceptLogo() {
    const confirmed = window.confirm("Clear all elements from this template except logos? This cannot be undone unless you reload without saving.");
    if (!confirmed) return;

    updateTemplates((current) =>
      current.map((template) => {
        if (template.id !== selectedTemplateId) return template;
        return {
          ...template,
          elements: template.elements.filter((element) => element.type === "logo"),
        };
      }),
    );
    setSelectedElementId(null);
  }

  function handleDrop(event, pageIndex) {
    event.preventDefault();
    const payload = JSON.parse(event.dataTransfer.getData("application/json"));
    const item = payload.items ? payload : { items: [payload] };
    const bounds = event.currentTarget.getBoundingClientRect();
    const width = item.width ?? item.items[0].width;
    const height = item.height ?? item.items[0].height;
    const x = clamp((event.clientX - bounds.left) / workspaceZoom - width / 2, 0, bounds.width / workspaceZoom - width);
    const y = clamp((event.clientY - bounds.top) / workspaceZoom - height / 2, 0, bounds.height / workspaceZoom - height);
    const element = makeElementFromItem(item, x, y, selectedBrand);
    element.pageIndex = pageIndex;

    updateTemplates((current) =>
      current.map((template) => {
        if (template.id !== selectedTemplateId) return template;
        return { ...template, elements: [...template.elements, element] };
      }),
    );
    setSelectedElementId(element.id);
    setSelectedPageIndex(pageIndex);
    setSelectedFieldIds([]);
  }

  function addShapeElement() {
    const element = makeShapeElement(selectedBrand);
    addElementToActiveSheet(element);
  }

  function addTextElement() {
    const element = makeTextElement();
    addElementToActiveSheet(element);
  }

  function addElementToActiveSheet(element) {
    const { width: canvasWidth, height: canvasHeight } = pageDimensions(selectedTemplate.page);
    const nextElement = {
      ...element,
      x: Math.round((canvasWidth - element.width) / 2),
      y: Math.round((canvasHeight - element.height) / 2),
      pageIndex: selectedPageIndex,
    };
    updateTemplates((current) =>
      current.map((template) => {
        if (template.id !== selectedTemplateId) return template;
        return { ...template, elements: [...template.elements, nextElement] };
      }),
    );
    setSelectedElementId(nextElement.id);
  }

  function addSheet() {
    const pages = getTemplatePages(selectedTemplate);
    const nextPages = [...pages, { id: `sheet-${Date.now()}` }];
    updateTemplate({ pages: nextPages });
    setSelectedElementId(null);
    setSelectedPageIndex(nextPages.length - 1);
  }

  function deleteSelectedSheet() {
    const pages = getTemplatePages(selectedTemplate);
    if (selectedPageIndex === 0 || selectedPageIndex >= pages.length) return;

    const confirmed = window.confirm(
      `Delete sheet ${selectedPageIndex + 1}? All elements on this sheet will be removed.`,
    );
    if (!confirmed) return;

    const nextPages = pages.filter((_, pageIndex) => pageIndex !== selectedPageIndex);
    updateTemplates((current) =>
      current.map((template) => {
        if (template.id !== selectedTemplateId) return template;
        return {
          ...template,
          pages: nextPages,
          elements: template.elements
            .filter((element) => (element.pageIndex ?? 0) !== selectedPageIndex)
            .map((element) => {
              const pageIndex = element.pageIndex ?? 0;
              return pageIndex > selectedPageIndex ? { ...element, pageIndex: pageIndex - 1 } : element;
            }),
        };
      }),
    );
    setSelectedElementId(null);
    setSelectedPageIndex(selectedPageIndex - 1);
  }

  function changeWorkspaceZoom(delta) {
    setWorkspaceZoom((current) => roundZoom(clamp(current + delta, 0.25, 5)));
  }

  function handleMove(elementId, startEvent) {
    if (startEvent.target.closest(".resize-handle")) return;
    if (startEvent.target.closest(".attribute-reorder-handle")) return;
    const element = selectedTemplate.elements.find((item) => item.id === elementId);
    const elementBounds = startEvent.currentTarget.getBoundingClientRect();
    const pointerOffsetX = (startEvent.clientX - elementBounds.left) / workspaceZoom;
    const pointerOffsetY = (startEvent.clientY - elementBounds.top) / workspaceZoom;
    setSelectedElementId(elementId);

    const move = (moveEvent) => {
      const targetPage = pageCanvasFromPoint(moveEvent.clientX, moveEvent.clientY) || startEvent.currentTarget.parentElement;
      const bounds = targetPage.getBoundingClientRect();
      const pageIndex = Number(targetPage.dataset.pageIndex || 0);
      const x = clamp((moveEvent.clientX - bounds.left) / workspaceZoom - pointerOffsetX, 0, bounds.width / workspaceZoom - element.width);
      const y = clamp((moveEvent.clientY - bounds.top) / workspaceZoom - pointerOffsetY, 0, bounds.height / workspaceZoom - element.height);
      updateElementById(elementId, { x, y, pageIndex });
      setSelectedPageIndex(pageIndex);
    };

    const stop = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop);
  }

  function handleResize(elementId, direction, startEvent) {
    startEvent.preventDefault();
    startEvent.stopPropagation();

    const element = selectedTemplate.elements.find((item) => item.id === elementId);
    const canvasBounds = startEvent.currentTarget.closest(".page-canvas").getBoundingClientRect();
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const original = {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      mediaWidth: element.mediaWidth,
      mediaHeight: element.mediaHeight,
    };
    setSelectedElementId(elementId);

    const move = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) / workspaceZoom;
      const dy = (moveEvent.clientY - startY) / workspaceZoom;
      const resized = resizeElement(original, direction, dx, dy, {
        width: canvasBounds.width / workspaceZoom,
        height: canvasBounds.height / workspaceZoom,
      });
      if (elementScalesMediaWithBox(element)) {
        resized.mediaWidth = resized.width;
        resized.mediaHeight = resized.height;
      }
      updateElementById(elementId, resized);
    };

    const stop = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop);
  }

  function handlePageNumberDrag(pageIndex, startEvent) {
    startEvent.preventDefault();
    startEvent.stopPropagation();
    setSelectedElementId(pageNumberSelectionId);
    setSelectedPageIndex(pageIndex);

    const pageNumber = startEvent.currentTarget;
    const pageCanvas = pageNumber.closest(".page-canvas");
    const pageBounds = pageCanvas.getBoundingClientRect();
    const numberBounds = pageNumber.getBoundingClientRect();
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const originalX = (numberBounds.left - pageBounds.left) / workspaceZoom;
    const originalY = (numberBounds.top - pageBounds.top) / workspaceZoom;
    const maxX = pageBounds.width / workspaceZoom - numberBounds.width / workspaceZoom;
    const maxY = pageBounds.height / workspaceZoom - numberBounds.height / workspaceZoom;

    const move = (moveEvent) => {
      updatePageNumbers({
        manualPositions: {
          ...(defaultPageNumbers(selectedTemplate).manualPositions || {}),
          [pageIndex]: {
            x: clamp(originalX + (moveEvent.clientX - startX) / workspaceZoom, 0, maxX),
            y: clamp(originalY + (moveEvent.clientY - startY) / workspaceZoom, 0, maxY),
          },
        },
      });
    };

    const stop = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop);
  }

  function updateElementById(elementId, patch) {
    setTemplates((current) =>
      current.map((template) => {
        if (template.id !== selectedTemplateId) return template;
        return {
          ...template,
          elements: template.elements.map((element) => (element.id === elementId ? { ...element, ...patch } : element)),
        };
      }),
    );
  }

  function removeFieldFromSelectedElement(fieldId) {
    if (!selectedElement) return;
    const remainingFields = getElementFields(selectedElement).filter((field) => fieldKey(field) !== fieldId);
    if (remainingFields.length === 0) {
      deleteSelectedElement();
      return;
    }

    updateSelectedElement({
      type: "attributeGroup",
      binding: undefined,
      value: undefined,
      fields: remainingFields,
      label: `${remainingFields.length} attribute${remainingFields.length === 1 ? "" : "s"}`,
      height: Math.max(54, Math.min(selectedElement.height, Math.max(80, remainingFields.length * 54))),
      displayMode: selectedElement.displayMode === "valueOnly" ? "none" : selectedElement.displayMode || "none",
    });
  }

  function reorderSelectedElementFields(fromIndex, toIndex) {
    if (!selectedElement || fromIndex === toIndex) return;
    const fields = [...getElementFields(selectedElement)];
    const [movedField] = fields.splice(fromIndex, 1);
    fields.splice(toIndex, 0, movedField);
    updateSelectedElement({ fields, type: "attributeGroup", binding: undefined, value: undefined });
  }

function moveSelectedElementLayer(action) {
    if (!selectedElement) return;
    updateTemplates((current) =>
      current.map((template) => {
        if (template.id !== selectedTemplateId) return template;
        return { ...template, elements: moveElementInLayer(template.elements, selectedElement.id, action) };
      }),
    );
  }

  function toggleFieldInSelectedElement(item) {
    if (!selectedElement || !hasAttributeBindings(selectedElement)) {
      setSelectedFieldIds((current) =>
        current.includes(fieldKey(item)) ? current.filter((id) => id !== fieldKey(item)) : [...current, fieldKey(item)],
      );
      return;
    }

    if (fieldMatchesElement(item, selectedElement)) {
      removeFieldFromSelectedElement(fieldKey(item));
      return;
    }

    const fields = [...getElementFields(selectedElement).map(copyField), copyField(item)];
    updateSelectedElement({
      type: "attributeGroup",
      binding: undefined,
      value: undefined,
      fields,
      label: `${fields.length} attributes`,
      width: Math.max(selectedElement.width, 300),
      height: Math.max(selectedElement.height, fields.length * 54),
      background: selectedElement.background === "transparent" ? "#ffffff" : selectedElement.background,
      backgroundOpacity: selectedElement.backgroundOpacity ?? 0,
      borderColor: selectedElement.borderColor || "#cbd8d4",
      borderWidth: selectedElement.borderWidth ?? 1,
      displayMode: selectedElement.displayMode === "valueOnly" ? "none" : selectedElement.displayMode || "none",
    });
  }

  return (
    <main className={`app-shell${libraryOpen ? "" : " library-collapsed"}`}>
      <button
        className={`library-toggle-button${libraryOpen ? "" : " collapsed"}`}
        type="button"
        onClick={() => setLibraryOpen((current) => !current)}
        aria-label={libraryOpen ? "Hide panel" : "Show panel"}
        title={libraryOpen ? "Hide panel" : "Show panel"}
      >
        <span className="sr-only">{libraryOpen ? "Hide panel" : "Show panel"}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="3" y="4" width="14" height="12" rx="1.75" />
          <path d="M7 4v12" />
          {libraryOpen ? <path d="M11.5 10h3" /> : <path d="M11.5 10h3m-1.5-1.5V11.5" />}
        </svg>
      </button>
      <aside className="library-panel" aria-label="Product and template library">
        <section className="panel-block">
          <details className="panel-toggle">
            <summary className="section-heading admin-heading">
              <span>Admin</span>
              <small>PIM API</small>
            </summary>
            <div className="panel-content">
              <PimAdmin
                channels={pimChannels}
                lastRequest={pimLastRequest}
                onChannelChange={(selectedChannelId) => updatePimSettings({ selectedChannelId })}
                onClearProducts={clearPimProducts}
                productCount={pimProducts.length}
                selectedChannel={selectedChannel}
                settings={pimSettings}
                status={pimStatus}
                onGetProducts={getPimProducts}
                onSettingsChange={updatePimSettings}
                onTest={testPimConnection}
              />
            </div>
          </details>
        </section>

        <section className="panel-block">
          <details className="panel-toggle">
            <summary className="section-heading">
              <span>Brand kit</span>
              <small>{selectedBrand.name}</small>
            </summary>
            <div className="panel-content">
              <BrandManager
                activeBrand={selectedBrand}
                brands={brandLibrary}
                onAddBrand={addBrand}
                onBrandChange={changeTemplateBrand}
                onBrandDelete={deleteBrand}
                onBrandUpdate={updateBrand}
                onGuidelineUpload={uploadBrandGuideline}
                onLogoUpload={uploadBrandLogo}
              />
            </div>
          </details>
        </section>

        <section className="panel-block">
          <div className="section-heading">
            <span>Templates</span>
            <div className="template-actions">
              <button type="button" onClick={newTemplate}>
                New
              </button>
              <button type="button" disabled={!selectedTemplate} onClick={deleteSelectedTemplate}>
                Delete
              </button>
            </div>
          </div>
          <label className="search-field">
            <span>Select template</span>
            <select
              value={selectedTemplateId}
              onChange={(event) => {
                setSelectedTemplateId(event.target.value);
                setSelectedElementId(null);
                setSelectedPageIndex(0);
              }}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · {template.page.size} · {template.page.orientation}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="panel-block">
          <div className="section-heading">
            <span>Products</span>
            <small>{pimProducts.length ? "PIM feed" : "Demo feed"}</small>
          </div>
          <label className="search-field">
            <span>Search products</span>
            <input
              value={productSearch}
              type="search"
              placeholder="Name, ID, category"
              onChange={(event) => setProductSearch(event.target.value)}
            />
          </label>
          <div className="product-list">
            {visibleProducts.map((product) => (
              <button
                className={`product-card${product.id === selectedProductId ? " active" : ""}`}
                key={product.id}
                type="button"
                onClick={() => setSelectedProductId(product.id)}
              >
                <img src={product.thumbnail || placeholderThumbnail(product.name)} alt="" />
                <span>
                  <strong>{product.name}</strong>
                  <span>
                    {product.id} · {product.category}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="builder-panel">
        <header className="builder-toolbar">
          <div className="builder-heading">
            <p className="eyebrow">Tech sheet builder</p>
            <div className="template-name-row">
              <input
                className="template-name-input"
                value={selectedTemplate.name}
                onChange={(event) => updateTemplate({ name: event.target.value })}
              />
            </div>
            {productSourceInfo && (
              <div className="template-source-pills">
                {productSourceInfo.accountName && (
                  <span className="template-source-pill">
                    <strong>Account</strong>
                    <span>{productSourceInfo.accountName}</span>
                  </span>
                )}
                {productSourceInfo.channelName && (
                  <span className="template-source-pill">
                    <strong>Channel</strong>
                    <span>{productSourceInfo.channelName}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="toolbar-actions">
            <label>
              Page
              <select
                value={selectedTemplate.page.size}
                onChange={(event) => updateTemplate({ page: { ...selectedTemplate.page, size: event.target.value } })}
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </label>
            <label>
              Orientation
              <select
                value={selectedTemplate.page.orientation}
                onChange={(event) =>
                  updateTemplate({ page: { ...selectedTemplate.page, orientation: event.target.value } })
                }
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            <button type="button" onClick={cloneTemplate}>
              Clone
            </button>
            <button type="button" className="primary-action" onClick={persistCurrentTemplate}>
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                persistCurrentTemplate();
                setPreviewOpen(true);
              }}
            >
              Preview PDF
            </button>
          </div>
        </header>

        <div className="workbench">
          <FieldPanel
            dynamicItems={dynamicItems}
            onFieldToggle={toggleFieldInSelectedElement}
            product={selectedProduct}
            selectedElement={selectedElement}
            selectedFieldIds={selectedFieldIds}
            templateElements={selectedTemplate.elements}
          />

          <section className="canvas-wrap" aria-label="Template workspace">
            <div className="zoom-toolbar" aria-label="Workspace zoom controls">
              <button type="button" onClick={() => changeWorkspaceZoom(-0.25)}>
                -
              </button>
              <label>
                Zoom {Math.round(workspaceZoom * 100)}%
                <input
                  value={workspaceZoom}
                  type="range"
                  min="0.25"
                  max="5"
                  step="0.05"
                  onChange={(event) => setWorkspaceZoom(Number(event.target.value))}
                />
              </label>
              <button type="button" onClick={() => changeWorkspaceZoom(0.25)}>
                +
              </button>
              <button type="button" onClick={() => setWorkspaceZoom(1)}>
                100%
              </button>
            </div>
            <div className="page-zoom-surface" style={{ zoom: workspaceZoom }}>
              <div className="page-stack">
                {templatePages.map((page, pageIndex) => (
                  <div className="sheet-frame" key={page.id}>
                    <div className="sheet-label">Sheet {pageIndex + 1}</div>
                    <div
                      className={`page-canvas size-${selectedTemplate.page.size} ${selectedTemplate.page.orientation}${selectedPageIndex === pageIndex && !selectedElement ? " active-sheet" : ""}`}
                      data-page-index={pageIndex}
                      style={pageSurfaceStyle(selectedTemplate.page)}
                      tabIndex={0}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleDrop(event, pageIndex)}
                      onPointerDown={(event) => {
                        if (event.target === event.currentTarget) {
                          setSelectedElementId(null);
                          setSelectedPageIndex(pageIndex);
                        }
                      }}
                    >
                      {selectedTemplate.elements
                        .filter((element) => (element.pageIndex ?? 0) === pageIndex)
                        .map((element) => (
                          <CanvasElement
                            brand={selectedBrand}
                            element={element}
                            isSelected={element.id === selectedElementId}
                            key={element.id}
                            product={selectedProduct}
                            onMove={handleMove}
                            onReorderFields={reorderSelectedElementFields}
                            onResize={handleResize}
                            onSelect={(elementId) => {
                              setSelectedElementId(elementId);
                              setSelectedPageIndex(pageIndex);
                            }}
                            onUpdate={updateElementById}
                          />
                        ))}
                      <PageNumber
                        isSelected={isPageNumberSelected}
                        isDraggable
                        pageIndex={pageIndex}
                        pageNumbers={defaultPageNumbers(selectedTemplate)}
                        pageTotal={templatePages.length}
                        onDragStart={handlePageNumberDrag}
                        onSelect={() => {
                          setSelectedElementId(pageNumberSelectionId);
                          setSelectedPageIndex(pageIndex);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <PropertiesPanel
            brand={selectedBrand}
            generatedPdf={generatedPdf}
            onAddShape={addShapeElement}
            onAddSheet={addSheet}
            onAddText={addTextElement}
            onClearAll={clearTemplateElementsExceptLogo}
            onCopyPdfUrl={copyGeneratedPdfUrl}
            onDeleteSheet={deleteSelectedSheet}
            element={selectedElement}
            canDeleteSheet={selectedPageIndex > 0}
            isPageNumberSelected={isPageNumberSelected}
            onDelete={deleteSelectedElement}
            onGeneratePdf={generatePdf}
            onUploadPdfToPim={uploadGeneratedPdfToPim}
            onLayerMove={moveSelectedElementLayer}
            onPageNumberModeChange={setPageNumberMode}
            onPageNumbersUpdate={updatePageNumbers}
            onPageUpdate={(patch) => updateTemplate({ page: { ...selectedTemplate.page, ...patch } })}
            pdfStatus={pdfStatus}
            product={selectedProduct}
            onUpdate={updateSelectedElement}
            page={selectedTemplate.page}
            pageNumbers={defaultPageNumbers(selectedTemplate)}
          />
        </div>
      </section>

      {previewOpen && (
        <PreviewDialog
          brand={selectedBrand}
          product={selectedProduct}
          template={selectedTemplate}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      <div className="pdf-render-surface" aria-hidden="true">
        <PreviewPages
          brand={selectedBrand}
          className="preview-stack pdf-render-root"
          containerId="pdfRenderRoot"
          product={selectedProduct}
          template={selectedTemplate}
        />
      </div>
    </main>
  );
}

function PimAdmin({
  channels,
  lastRequest,
  onChannelChange,
  onClearProducts,
  onGetProducts,
  onSettingsChange,
  onTest,
  productCount,
  selectedChannel,
  settings,
  status,
}) {
  const isBusy = status.type === "loading";
  const selectedChannelToken = selectedChannel?.token?.trim() || "";
  const canRequest = Boolean((settings.baseUrl?.trim() || settings.productsPath?.trim()) && selectedChannelToken);

  return (
    <div className="pim-admin">
      <label>
        API Feed Key
        <input
          value={settings.apiFeedKey}
          type="password"
          placeholder="Paste API feed key"
          onChange={(event) => onSettingsChange({ apiFeedKey: event.target.value })}
        />
      </label>
      <label className="pim-channel-row">
        <span>Channels</span>
        <select
          value={settings.selectedChannelId || ""}
          onChange={(event) => onChannelChange(event.target.value)}
          disabled={!settings.apiFeedKey?.trim() || channels.length === 0}
        >
          <option value="">
            {!settings.apiFeedKey?.trim()
              ? "Enter API Feed Key to load channels"
              : channels.some((channel) => channel.isApiChannel && channel.token)
                ? "Select a channel"
                : isBusy
                  ? "Loading channels..."
                  : channels.length
                    ? "No API channels available"
                    : "No channels loaded"}
          </option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id} disabled={!channel.isApiChannel || !channel.token}>
              {channel.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Base URL
        <input
          value={settings.baseUrl}
          type="url"
          placeholder="https://api.pimberly.io"
          onChange={(event) => onSettingsChange({ baseUrl: event.target.value })}
        />
      </label>
      <label>
        Products JSON GET URL or path
        <input
          value={settings.productsPath}
          type="text"
          placeholder="https://api.pimberly.io/core/products"
          onChange={(event) => onSettingsChange({ productsPath: event.target.value })}
        />
      </label>
      <div className="pim-actions">
        <button type="button" disabled={isBusy || !canRequest} onClick={onTest}>
          Test
        </button>
        <details className="pim-products-menu">
          <summary>Products</summary>
          <div>
            <button type="button" disabled={isBusy || !canRequest} onClick={onGetProducts}>
              Get
            </button>
            <button type="button" disabled={isBusy || productCount === 0} onClick={onClearProducts}>
              Clear
            </button>
          </div>
        </details>
      </div>
      <div className={`pim-status ${status.type}`} role="status">
        {status.message}
        {productCount > 0 && status.type !== "loading" ? ` · ${productCount} stored` : ""}
      </div>
      {lastRequest && (
        <div className="pim-request-debug">
          <strong>Last request</strong>
          <span>Method: {lastRequest.method}</span>
          <span>URL: {lastRequest.url}</span>
          <span>Authorisation key: {lastRequest.authorizationKey}</span>
          <span>Authorisation code: {lastRequest.authorizationValue}</span>
        </div>
      )}
      {channels.length > 0 && (
        <div className="pim-request-debug">
          <strong>Loaded channels</strong>
          <span>{channels.length} available</span>
          {settings.selectedChannelId && (
            <span>
              Selected channel ID: {settings.selectedChannelId}
            </span>
          )}
          <span>{channels.filter((channel) => channel.isApiChannel && channel.token).length} API-enabled</span>
          {selectedChannel && (
            <span>
              Selected channel token: {maskSecret(selectedChannelToken)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function FieldPanel({
  dynamicItems,
  onFieldToggle,
  product,
  selectedElement,
  selectedFieldIds,
  templateElements,
}) {
  const selectedItems = dynamicItems.filter((item) => selectedFieldIds.includes(fieldKey(item)));
  const editingSelectedElement = hasAttributeBindings(selectedElement);

  return (
    <aside className="field-panel" aria-label="Product attributes and assets">
      <div className="section-heading">
        <span>{product.name}</span>
        <small>Drag into page</small>
      </div>
      <div className="field-list">
        {dynamicItems.map((item) => (
          <FieldChip
            isActive={fieldMatchesElement(item, selectedElement)}
            isFieldSelected={!editingSelectedElement && selectedFieldIds.includes(fieldKey(item))}
            isUsed={fieldIsUsed(item, templateElements)}
            item={item}
            key={`${item.type}-${item.label}`}
            onToggle={() => onFieldToggle(item)}
            selectedDragItems={selectedItems}
          />
        ))}
      </div>
      <div className="section-heading add-heading">
        <span>Static elements</span>
      </div>
      <div className="field-list">
        {staticItems.map((item) => (
          <FieldChip
            isActive={fieldMatchesElement(item, selectedElement)}
            isFieldSelected={false}
            isUsed={fieldIsUsed(item, templateElements)}
            item={item}
            key={`${item.type}-${item.label}`}
            selectedDragItems={[]}
          />
        ))}
      </div>
    </aside>
  );
}

function BrandManager({
  activeBrand,
  brands,
  onAddBrand,
  onBrandChange,
  onBrandDelete,
  onBrandUpdate,
  onGuidelineUpload,
  onLogoUpload,
}) {
  return (
    <div className="brand-manager">
      <label>
        Brand
        <select value={activeBrand.id} onChange={(event) => onBrandChange(event.target.value)}>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </label>
      <div className="brand-actions">
        <button type="button" onClick={onAddBrand}>
          Add brand
        </button>
        <button type="button" disabled={brands.length <= 1} onClick={() => onBrandDelete(activeBrand.id)}>
          Delete brand
        </button>
      </div>
      <label>
        Brand name
        <input
          value={activeBrand.name}
          onChange={(event) => onBrandUpdate(activeBrand.id, { name: event.target.value })}
        />
      </label>
      <div className="brand-card">
        {activeBrand.logo ? (
          <img
            className="draggable-brand-logo"
            draggable
            src={activeBrand.logo}
            alt={`${activeBrand.name} logo`}
            title="Drag logo onto the page"
            onDragStart={(event) => {
              event.dataTransfer.setData(
                "application/json",
                JSON.stringify({ type: "logo", label: `${activeBrand.name} logo`, source: "brand.logo", width: 132, height: 56 }),
              );
            }}
          />
        ) : (
          <div className="logo-placeholder">Logo</div>
        )}
          <div>
            <strong>Primary palette</strong>
            {activeBrand.logo && <span className="brand-logo-hint">Drag logo into page</span>}
            <div className="swatches">
              {activeBrand.colors?.length ? (
                activeBrand.colors.map((color) => (
                  <span className="swatch" key={color} style={{ background: color }} title={color} />
                ))
              ) : (
                <span className="empty-brand-note">No colours extracted yet</span>
              )}
            </div>
          </div>
        </div>
      <label>
        Upload logo
        <input
          accept="image/*"
          type="file"
          onChange={(event) => onLogoUpload(activeBrand.id, event.target.files?.[0])}
        />
      </label>
      <label>
        Upload brand guideline
        <input
          accept=".pdf,.docx,.pptx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          type="file"
          onChange={(event) => onGuidelineUpload(activeBrand.id, event.target.files?.[0])}
        />
      </label>
      <BrandExtractionSummary brand={activeBrand} />
    </div>
  );
}

function BrandExtractionSummary({ brand }) {
  return (
    <div className="brand-extraction">
      <strong>Guideline extraction</strong>
      <span>{brand.guidelines?.length ? `${brand.guidelines.length} file(s) uploaded` : "No guideline uploaded yet"}</span>
      {brand.fonts?.length > 0 && <span>Fonts: {brand.fonts.join(", ")}</span>}
      {brand.toneRules?.length > 0 && (
        <details>
          <summary>Tone of voice</summary>
          <ul>
            {brand.toneRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function FieldChip({ isActive, isFieldSelected, isUsed, item, onToggle, selectedDragItems }) {
  return (
    <div
      className={`field-chip${isUsed ? " used-binding" : ""}${isFieldSelected ? " field-selected" : ""}${isActive ? " active-binding" : ""}`}
      draggable
      onClick={onToggle}
      onDragStart={(event) => {
        const draggedItems =
          selectedDragItems.length > 1 && selectedDragItems.some((selectedItem) => fieldKey(selectedItem) === fieldKey(item))
            ? selectedDragItems
            : [item];
        event.dataTransfer.setData("application/json", JSON.stringify(makeDragPayload(draggedItems)));
      }}
    >
      {item.type === "image" && <img className="field-chip-thumb" src={item.value} alt="" />}
      <span className="field-chip-copy">
        <strong>{item.label}</strong>
        <span>{fieldSubtitle(item)}</span>
      </span>
    </div>
  );
}

function PageNumber({ isDraggable = false, isSelected, onDragStart, onSelect, pageIndex, pageNumbers, pageTotal }) {
  if (pageNumbers.mode === "none") return null;

  return (
    <button
      className={`page-number${isSelected ? " selected" : ""}`}
      style={pageNumberStyle(pageNumbers, pageIndex)}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerDown={(event) => {
        if (isDraggable) {
          onDragStart?.(pageIndex, event);
          return;
        }
        event.stopPropagation();
      }}
    >
      {formatPageNumber(pageNumbers.mode, pageIndex, pageTotal)}
    </button>
  );
}

function CanvasElement({
  brand,
  element,
  isSelected,
  product,
  onMove,
  onReorderFields,
  onResize,
  onSelect,
  onUpdate,
  previewOnly = false,
}) {
  const mediaSize = getMediaSize(element);
  const visualKind = shouldRenderAttributeContent(element)
    ? "attributeGroup"
    : element.type;
  const style = {
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    background: element.type === "shape" ? "transparent" : elementBackgroundColor(element),
    borderColor: element.type === "shape" ? "transparent" : element.borderColor || defaultBorderColor(element),
    borderWidth: element.type === "shape" ? 0 : element.borderWidth ?? defaultBorderWidth(element),
    borderRadius: element.borderRadius ?? 8,
    color: element.color || "#17211f",
    fontFamily: element.fontFamily || "Inter, sans-serif",
    fontSize: element.fontSize || 14,
  };

  return (
    <div
      className={`canvas-element${isSelected && !previewOnly ? " selected" : ""}`}
      data-kind={visualKind}
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(element.id);
      }}
      onPointerDown={(event) => onMove?.(element.id, event)}
    >
      <ElementContent
        brand={brand}
        canReorder={isSelected && !previewOnly}
        element={element}
        mediaSize={mediaSize}
        onReorderFields={onReorderFields}
        onUpdate={onUpdate}
        product={product}
      />
      {isSelected && !previewOnly && (
        <>
          {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((direction) => (
            <span
              className="resize-handle"
              data-resize={direction}
              key={direction}
              onPointerDown={(event) => onResize(element.id, direction, event)}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ElementContent({ brand, canReorder, element, mediaSize, onReorderFields, onUpdate, product }) {
  if (shouldRenderAttributeContent(element)) {
    return (
      <AttributeContent
        brand={brand}
        canReorder={canReorder}
        element={element}
        onReorderFields={onReorderFields}
        onUpdate={(patch) => onUpdate?.(element.id, patch)}
        product={product}
      />
    );
  }

  if (element.type === "image" || element.type === "logo") {
    const src = element.type === "logo" ? brand.logo : resolveBinding(product, element.binding);
    if (!src) return null;
    if (element.type === "image" && looksLikeUrl(src) && !looksLikeImageAssetUrl(src)) {
      return renderUrlValue(src, element.label, element.urlDisplayMode || "text");
    }

    return (
      <img
        src={src}
        alt={element.label}
        style={{ width: mediaSize.width, height: mediaSize.height }}
      />
    );
  }

  if (element.type === "table") {
    return (
      <>
        {specRows(product).map(([label, value]) => (
          <div className="spec-row" key={label}>
            <span>{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </>
    );
  }

  if (element.type === "shape") return <ShapeContent element={element} />;
  if (element.type === "text" && !element.binding) {
    return (
      <EditableCanvasText
        element={element}
        onUpdate={(patch) => onUpdate?.(element.id, patch)}
      />
    );
  }
  if (element.binding) {
    return (
      <AttributeValue
        brand={brand}
        field={{
          binding: element.binding,
          label: element.label,
          type: element.type,
          value: element.value,
          urlDisplayMode: element.urlDisplayMode,
        }}
        product={product}
      />
    );
  }
  return element.value || element.label;
}

function EditableCanvasText({ element, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const textAlign = element.contentHorizontalAlign || "left";
  const textBoxStyle = {
    alignItems: verticalAlignToFlex(element.contentVerticalAlign),
    justifyContent: horizontalAlignToFlex(element.contentHorizontalAlign),
    textAlign,
  };

  if (isEditing) {
    return (
      <textarea
        autoFocus
        className="canvas-text-editor"
        style={{ textAlign }}
        value={element.value || ""}
        onBlur={() => setIsEditing(false)}
        onChange={(event) => onUpdate({ value: event.target.value })}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      />
    );
  }

  return (
    <div
      className="canvas-text-content"
      style={textBoxStyle}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setIsEditing(true);
      }}
    >
      <span>{element.value || ""}</span>
    </div>
  );
}

function ShapeContent({ element }) {
  const shape = element.shapeType || "rectangle";
  const fill = element.fillColor || element.background || "#0c7c78";
  const fillOpacity = element.fillOpacity ?? 1;
  const stroke = element.outlineStyle === "none" ? "transparent" : element.outlineColor || element.borderColor || "#17211f";
  const strokeWidth = element.outlineStyle === "none" ? 0 : element.outlineWidth ?? element.borderWidth ?? 1;
  const strokeOpacity = element.outlineStyle === "none" ? 0 : element.outlineOpacity ?? 1;
  const dashArray = outlineDashArray(element.outlineStyle, strokeWidth);
  const common = {
    fill,
    fillOpacity,
    stroke,
    strokeDasharray: dashArray,
    strokeOpacity,
    strokeWidth,
    vectorEffect: "non-scaling-stroke",
  };

  return (
    <svg className="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {shape === "ellipse" && <ellipse cx="50" cy="50" rx="48" ry="48" {...common} />}
      {shape === "triangle" && <polygon points="50,3 97,97 3,97" {...common} />}
      {shape === "diamond" && <polygon points="50,3 97,50 50,97 3,50" {...common} />}
      {shape === "pentagon" && <polygon points="50,3 97,38 79,97 21,97 3,38" {...common} />}
      {shape === "hexagon" && <polygon points="25,3 75,3 98,50 75,97 25,97 2,50" {...common} />}
      {shape === "octagon" && <polygon points="30,3 70,3 97,30 97,70 70,97 30,97 3,70 3,30" {...common} />}
      {shape === "star" && (
        <polygon points="50,3 61,35 95,35 68,55 79,90 50,69 21,90 32,55 5,35 39,35" {...common} />
      )}
      {shape === "trapezoid" && <polygon points="20,3 80,3 98,97 2,97" {...common} />}
      {shape === "parallelogram" && <polygon points="25,3 98,3 75,97 2,97" {...common} />}
      {shape === "rightArrow" && <polygon points="2,28 58,28 58,8 98,50 58,92 58,72 2,72" {...common} />}
      {shape === "leftArrow" && <polygon points="98,28 42,28 42,8 2,50 42,92 42,72 98,72" {...common} />}
      {shape === "upArrow" && <polygon points="28,98 28,42 8,42 50,2 92,42 72,42 72,98" {...common} />}
      {shape === "downArrow" && <polygon points="28,2 28,58 8,58 50,98 92,58 72,58 72,2" {...common} />}
      {shape === "chevronRight" && <polygon points="28,3 92,50 28,97 8,76 44,50 8,24" {...common} />}
      {shape === "chevronLeft" && <polygon points="72,3 8,50 72,97 92,76 56,50 92,24" {...common} />}
      {shape === "plus" && <polygon points="38,3 62,3 62,38 97,38 97,62 62,62 62,97 38,97 38,62 3,62 3,38 38,38" {...common} />}
      {shape === "cross" && <polygon points="20,3 50,33 80,3 97,20 67,50 97,80 80,97 50,67 20,97 3,80 33,50 3,20" {...common} />}
      {shape === "speechBubble" && (
        <path d="M6 8h88v60H38L18 92V68H6Z" {...common} />
      )}
      {shape === "cloud" && (
        <path d="M28 78h48c13 0 22-9 22-21 0-11-8-20-19-21C75 22 63 12 49 12 35 12 23 22 19 35 9 38 2 46 2 57c0 12 10 21 26 21Z" {...common} />
      )}
      {shape === "roundedRectangle" && <rect x="2" y="2" width="96" height="96" rx="12" ry="12" {...common} />}
      {shape === "rectangle" && <rect x="2" y="2" width="96" height="96" {...common} />}
    </svg>
  );
}

function AttributeContent({ brand, canReorder, element, onReorderFields, onUpdate, product }) {
  const fields = getElementFields(element);
  const mode = element.displayMode || (element.fields?.length ? "tabular" : "valueOnly");
  const [dragIndex, setDragIndex] = useState(null);
  const labelColumnWidth = element.attributeLabelColumnWidth ?? 38;
  const alignmentStyle = {
    "--attribute-horizontal-align": horizontalAlignToFlex(element.attributeHorizontalAlign),
    "--attribute-text-align": element.attributeHorizontalAlign || "left",
    "--attribute-vertical-align": verticalAlignToFlex(element.attributeVerticalAlign),
    "--attribute-label-column": `${labelColumnWidth}%`,
  };

  function reorderDropProps(index) {
    if (!canReorder || fields.length < 2) return {};
    return {
      onDragEnd: () => setDragIndex(null),
      onDragOver: (event) => event.preventDefault(),
      onDrop: (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (dragIndex !== null) onReorderFields?.(dragIndex, index);
        setDragIndex(null);
      },
    };
  }

  function reorderHandleProps(index) {
    if (!canReorder || fields.length < 2) return {};
    return {
      draggable: true,
      onPointerDown: (event) => event.stopPropagation(),
      onDragStart: (event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        setDragIndex(index);
      },
    };
  }

  function ReorderHandle({ index }) {
    if (!canReorder || fields.length < 2) return null;
    return (
      <button className="attribute-reorder-handle" type="button" title="Drag to reorder attribute" {...reorderHandleProps(index)}>
        <span>Drag</span>
      </button>
    );
  }

  function reorderClass(index) {
    if (!canReorder || fields.length < 2) return "";
    return ` reorderable-attribute${dragIndex === index ? " dragging" : ""}`;
  }

  function startColumnResize(event) {
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.closest(".table-attributes").getBoundingClientRect();

    const move = (moveEvent) => {
      const nextWidth = clamp(((moveEvent.clientX - bounds.left) / bounds.width) * 100, 18, 72);
      onUpdate?.({ attributeLabelColumnWidth: Math.round(nextWidth) });
    };

    const stop = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop);
  }

  if (mode === "none" || mode === "valueOnly") {
    return (
      <div className="attribute-list value-attributes" style={alignmentStyle}>
        {fields.map((field, index) => (
          <div className={`attribute-value-only${reorderClass(index)}`} key={fieldKey(field)} {...reorderDropProps(index)}>
            <ReorderHandle index={index} />
            <AttributeValue brand={brand} field={field} product={product} />
          </div>
        ))}
      </div>
    );
  }

  if (mode === "inline") {
    return (
      <div className="attribute-list inline-attributes" style={alignmentStyle}>
        {fields.map((field, index) => (
          <div className={`attribute-inline${reorderClass(index)}`} key={fieldKey(field)} {...reorderDropProps(index)}>
            <ReorderHandle index={index} />
            <span className="attribute-inline-copy">
              <strong>{field.label}</strong>
              <AttributeValue brand={brand} field={field} product={product} />
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="attribute-list table-attributes" style={alignmentStyle}>
      {canReorder && (
        <button
          className="attribute-column-resizer"
          style={{ left: `calc(${labelColumnWidth}% - 5px)` }}
          type="button"
          title="Drag to resize columns"
          onPointerDown={startColumnResize}
        >
          <span>Resize columns</span>
        </button>
      )}
      {fields.map((field, index) => (
        <div className={`attribute-row${reorderClass(index)}`} key={fieldKey(field)} {...reorderDropProps(index)}>
          <ReorderHandle index={index} />
          <span className="attribute-name-cell">{field.label}</span>
          <AttributeValue brand={brand} field={field} product={product} />
        </div>
      ))}
    </div>
  );
}

function AttributeValue({ brand, field, product }) {
  const resolvedValue = field.binding ? resolveBinding(product, field.binding) : field.value || "";

  if (field.type === "image" || field.type === "logo") {
    return (
      <img
        className="attribute-value-image"
        src={field.type === "logo" ? brand.logo : resolvedValue}
        alt={field.label}
      />
    );
  }

  if (looksLikeUrl(resolvedValue)) {
    return renderUrlValue(resolvedValue, field.label, field.urlDisplayMode || "text");
  }

  return <span>{resolvedValue}</span>;
}

function renderUrlValue(url, label, displayMode) {
  if (displayMode === "qr") {
    return <img className="attribute-qr-code" src={qrCodeUrl(url)} alt={`QR code for ${label}`} />;
  }

  if (displayMode === "link") {
    return (
      <a
        className="attribute-link"
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {label}
      </a>
    );
  }

  return <span>{url}</span>;
}

function PropertiesPanel({
  brand,
  canDeleteSheet,
  element,
  generatedPdf,
  isPageNumberSelected,
  onAddShape,
  onAddSheet,
  onAddText,
  onClearAll,
  onCopyPdfUrl,
  onDeleteSheet,
  onDelete,
  onGeneratePdf,
  onLayerMove,
  onPageNumberModeChange,
  onPageNumbersUpdate,
  onPageUpdate,
  onUploadPdfToPim,
  pdfStatus,
  product,
  onUpdate,
  page,
  pageNumbers,
}) {
  return (
    <aside className="properties-panel" aria-label="Element properties">
      <div className="section-heading">
        <span>Properties</span>
        <button type="button" disabled={!element} onClick={onDelete}>
          Delete
        </button>
      </div>
      {!element && !isPageNumberSelected && (
        <div className="empty-tools">
          <div className="empty-state">Select an element on the page, or add content to the active sheet.</div>
          <button className="clear-template-button" type="button" onClick={onClearAll}>
            Clear All
          </button>
          <button className="add-shape-button" type="button" onClick={onAddShape}>
            Add Shape
          </button>
          <button className="add-tool-button" type="button" onClick={onAddText}>
            Add Text
          </button>
          <button
            className="add-tool-button"
            type="button"
            onClick={canDeleteSheet ? onDeleteSheet : onAddSheet}
          >
            {canDeleteSheet ? "Delete Sheet" : "Add Sheet"}
          </button>
          <PageNumberMenu onModeChange={onPageNumberModeChange} value={pageNumbers.mode} />
          <PageBackgroundMenu brand={brand} onUpdate={onPageUpdate} page={page} />
        </div>
      )}
      {isPageNumberSelected && (
        <PageNumberControls
          brand={brand}
          onModeChange={onPageNumberModeChange}
          onUpdate={onPageNumbersUpdate}
          pageNumbers={pageNumbers}
        />
      )}
      {element && (
        <form className="props-form">
          <section className="layer-controls">
            <span>Layer order</span>
            <div className="layer-buttons">
              <button type="button" onClick={() => onLayerMove("back")}>
                Send back
              </button>
              <button type="button" onClick={() => onLayerMove("backward")}>
                Backward
              </button>
              <button type="button" onClick={() => onLayerMove("forward")}>
                Forward
              </button>
              <button type="button" onClick={() => onLayerMove("front")}>
                Bring front
              </button>
            </div>
          </section>
          <label>
            Label
            <input value={element.label || ""} type="text" onChange={(event) => onUpdate({ label: event.target.value })} />
          </label>
          {element.type === "text" && !element.binding && (
            <label>
              Text
              <textarea
                value={element.value || ""}
                rows="4"
                onChange={(event) => onUpdate({ value: event.target.value })}
              />
            </label>
          )}
          <label>
            Width
            <input
              value={element.width}
              type="number"
              min="40"
              onChange={(event) => onUpdate({ width: Number(event.target.value) })}
            />
          </label>
          <label>
            Height
            <input
              value={element.height}
              type="number"
              min="24"
              onChange={(event) => onUpdate({ height: Number(event.target.value) })}
            />
          </label>
          {hasAttributeBindings(element) && (
            <>
              <label>
                Attribute display
                <select
                  value={element.displayMode || (element.type === "attributeGroup" ? "tabular" : "valueOnly")}
                  onChange={(event) => onUpdate({ displayMode: event.target.value })}
                >
                  {element.type !== "attributeGroup" && <option value="valueOnly">Value only</option>}
                  <option value="none">None: values only</option>
                  <option value="tabular">Tabular: name and value</option>
                  <option value="inline">Inline: name above value</option>
                </select>
              </label>
              <AlignmentControls
                horizontalValue={element.attributeHorizontalAlign || "left"}
                label="Attribute data"
                onHorizontalChange={(value) => onUpdate({ attributeHorizontalAlign: value })}
                onVerticalChange={(value) => onUpdate({ attributeVerticalAlign: value })}
                verticalValue={element.attributeVerticalAlign || "top"}
              />
            </>
          )}
          {elementSupportsUrlDisplay(element, product) && (
            <label>
              URL display
              <select
                value={element.urlDisplayMode || "text"}
                onChange={(event) => onUpdate({ urlDisplayMode: event.target.value })}
              >
                <option value="text">Text</option>
                <option value="link">Clickable link</option>
                <option value="qr">QR code</option>
              </select>
            </label>
          )}
          {element.type === "text" && !element.binding && (
            <AlignmentControls
              horizontalValue={element.contentHorizontalAlign || "left"}
              label="Text"
              onHorizontalChange={(value) => onUpdate({ contentHorizontalAlign: value })}
              onVerticalChange={(value) => onUpdate({ contentVerticalAlign: value })}
              verticalValue={element.contentVerticalAlign || "top"}
            />
          )}
          {element.type === "shape" ? (
            <ShapeControls brand={brand} element={element} onUpdate={onUpdate} />
          ) : (
            <>
              <ColorField
                brand={brand}
                fallback="#ffffff"
                label="Background"
                value={element.background}
                onChange={(color) => onUpdate({ background: color })}
              />
              <label>
                Background opacity: {Math.round(elementBackgroundOpacity(element) * 100)}%
                <input
                  value={elementBackgroundOpacity(element)}
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  onChange={(event) => onUpdate({ backgroundOpacity: Number(event.target.value) })}
                />
              </label>
              <ColorField
                brand={brand}
                fallback={defaultBorderColor(element)}
                label="Border color"
                value={element.borderColor}
                onChange={(color) => onUpdate({ borderColor: color })}
              />
              <label>
                Border width: {element.borderWidth ?? defaultBorderWidth(element)}
                <input
                  value={element.borderWidth ?? defaultBorderWidth(element)}
                  type="range"
                  min="0"
                  max="50"
                  onChange={(event) => onUpdate({ borderWidth: Number(event.target.value) })}
                />
              </label>
              <label>
                Corners
                <select
                  value={radiusPresetValue(element.borderRadius ?? 8)}
                  onChange={(event) => {
                    if (event.target.value !== "custom") onUpdate({ borderRadius: Number(event.target.value) });
                  }}
                >
                  <option value="0">Sharp</option>
                  <option value="4">Slight</option>
                  <option value="8">Rounded</option>
                  <option value="16">Soft</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label>
                Corner radius: {element.borderRadius ?? 8}
                <input
                  value={element.borderRadius ?? 8}
                  type="range"
                  min="0"
                  max="50"
                  onChange={(event) => onUpdate({ borderRadius: Number(event.target.value) })}
                />
              </label>
            </>
          )}
          <ColorField
            brand={brand}
            fallback="#17211f"
            label="Text color"
            value={element.color}
            onChange={(color) => onUpdate({ color })}
          />
          {elementHasText(element) && (
            <>
              <label>
                Font
                <select
                  value={element.fontFamily || "Inter, sans-serif"}
                  onChange={(event) => onUpdate({ fontFamily: event.target.value })}
                >
                  <option value="Inter, sans-serif">Inter</option>
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="Helvetica, Arial, sans-serif">Helvetica</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="'Times New Roman', Times, serif">Times New Roman</option>
                  <option value="'Courier New', Courier, monospace">Courier New</option>
                  <option value="Verdana, sans-serif">Verdana</option>
                </select>
              </label>
              <label>
                Font size: {element.fontSize || 14}
                <input
                  value={element.fontSize || 14}
                  type="range"
                  min="8"
                  max="50"
                  onChange={(event) => onUpdate({ fontSize: Number(event.target.value) })}
                />
              </label>
            </>
          )}
        </form>
      )}
      <section className="pdf-tools">
        <button className="add-tool-button" type="button" onClick={onGeneratePdf}>
          Generate PDF
        </button>
        {pdfStatus.message && <div className={`pdf-status ${pdfStatus.type}`}>{pdfStatus.message}</div>}
        {generatedPdf && (
          <>
            <button className="add-tool-button" type="button" onClick={onUploadPdfToPim}>
              Upload to PIM
            </button>
            <details className="page-number-menu pdf-url-menu">
              <summary>PDF URL</summary>
              <div>
                <label>
                  PDF URL
                  <input readOnly type="text" value={generatedPdf.url} />
                </label>
                <button type="button" onClick={onCopyPdfUrl}>
                  Copy
                </button>
                <button type="button" onClick={() => window.open(normalizePublicPdfUrl(generatedPdf.url), "_blank", "noopener,noreferrer")}>
                  Open
                </button>
              </div>
            </details>
          </>
        )}
      </section>
    </aside>
  );
}

function PageNumberMenu({ onModeChange, value }) {
  return (
    <details className="page-number-menu">
      <summary>Page Numbers</summary>
      <div>
        <button className={value === "none" ? "active" : ""} type="button" onClick={() => onModeChange("none")}>
          None
        </button>
        <button className={value === "page" ? "active" : ""} type="button" onClick={() => onModeChange("page")}>
          Page 1
        </button>
        <button className={value === "pageOfTotal" ? "active" : ""} type="button" onClick={() => onModeChange("pageOfTotal")}>
          Page 1 of 2
        </button>
      </div>
    </details>
  );
}

function ColorField({ brand, fallback, label, onChange, value }) {
  const currentValue = colorInputValue(value, fallback);
  const colors = brandPalette(brand);

  return (
    <div className="color-field">
      <span>{label}</span>
      <details>
        <summary>
          <span className="color-bar" style={{ backgroundColor: currentValue }} />
          <span>{currentValue}</span>
        </summary>
        <div className="color-field-popover">
          {colors.length > 0 && (
            <div className="brand-color-palette" aria-label={`${label} brand colors`}>
              {colors.map((color) => (
                <button
                  className={currentValue.toLowerCase() === color.toLowerCase() ? "active" : ""}
                  key={color}
                  style={{ backgroundColor: color }}
                  title={color}
                  type="button"
                  onClick={() => onChange(color)}
                >
                  <span>{color}</span>
                </button>
              ))}
            </div>
          )}
          <label>
            Custom color
            <input value={currentValue} type="color" onChange={(event) => onChange(event.target.value)} />
          </label>
        </div>
      </details>
    </div>
  );
}

function PageBackgroundMenu({ brand, onUpdate, page }) {
  const backgroundOpacity = page.backgroundOpacity ?? 1;
  const edgeOpacity = page.edgeOpacity ?? 1;
  const edgeWidth = page.edgeWidth ?? 1;

  return (
    <details className="page-number-menu background-menu">
      <summary>Background</summary>
      <div className="background-editor">
        <ColorField
          brand={brand}
          fallback="#ffffff"
          label="Background color"
          value={page.background}
          onChange={(color) => onUpdate({ background: color })}
        />
        <label>
          Background opacity: {Math.round(backgroundOpacity * 100)}%
          <input
            value={backgroundOpacity}
            type="range"
            min="0"
            max="1"
            step="0.05"
            onChange={(event) => onUpdate({ backgroundOpacity: Number(event.target.value) })}
          />
        </label>
        <label>
          Line edge style
          <select value={page.edgeStyle || "solid"} onChange={(event) => onUpdate({ edgeStyle: event.target.value })}>
            <option value="none">None</option>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="double">Double</option>
          </select>
        </label>
        <ColorField
          brand={brand}
          fallback="#bac8c4"
          label="Line edge color"
          value={page.edgeColor}
          onChange={(color) => onUpdate({ edgeColor: color })}
        />
        <label>
          Line edge opacity: {Math.round(edgeOpacity * 100)}%
          <input
            value={edgeOpacity}
            type="range"
            min="0"
            max="1"
            step="0.05"
            onChange={(event) => onUpdate({ edgeOpacity: Number(event.target.value) })}
          />
        </label>
        <label>
          Line edge size: {edgeWidth}
          <input
            value={edgeWidth}
            type="range"
            min="1"
            max="50"
            onChange={(event) => onUpdate({ edgeWidth: Number(event.target.value) })}
          />
        </label>
      </div>
    </details>
  );
}

function PageNumberControls({ brand, onModeChange, onUpdate, pageNumbers }) {
  return (
    <form className="props-form">
      <label>
        Format
        <select value={pageNumbers.mode} onChange={(event) => onModeChange(event.target.value)}>
          <option value="none">None</option>
          <option value="page">Page 1</option>
          <option value="pageOfTotal">Page 1 of 2</option>
        </select>
      </label>
      <label>
        Font
        <select value={pageNumbers.fontFamily} onChange={(event) => onUpdate({ fontFamily: event.target.value })}>
          <option value="Inter, sans-serif">Inter</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="Helvetica, Arial, sans-serif">Helvetica</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="'Times New Roman', Times, serif">Times New Roman</option>
          <option value="'Courier New', Courier, monospace">Courier New</option>
          <option value="Verdana, sans-serif">Verdana</option>
        </select>
      </label>
      <ColorField
        brand={brand}
        fallback="#17211f"
        label="Color"
        value={pageNumbers.color}
        onChange={(color) => onUpdate({ color })}
      />
      <label>
        Size: {pageNumbers.fontSize}
        <input
          value={pageNumbers.fontSize}
          type="range"
          min="8"
          max="50"
          onChange={(event) => onUpdate({ fontSize: Number(event.target.value) })}
        />
      </label>
      <label>
        Horizontal alignment
        <select
          value={pageNumbers.horizontalAlign}
          onChange={(event) => onUpdate({ horizontalAlign: event.target.value, manualPositions: {} })}
        >
          <option value="left">Left</option>
          <option value="center">Centre</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label>
        Vertical alignment
        <select
          value={pageNumbers.verticalAlign}
          onChange={(event) => onUpdate({ verticalAlign: event.target.value, manualPositions: {} })}
        >
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
      </label>
    </form>
  );
}

function AlignmentControls({
  horizontalValue,
  label,
  onHorizontalChange,
  onVerticalChange,
  verticalValue,
}) {
  return (
    <>
      <label>
        {label} vertical alignment
        <select value={verticalValue} onChange={(event) => onVerticalChange(event.target.value)}>
          <option value="top">Top</option>
          <option value="center">Centre</option>
          <option value="bottom">Bottom</option>
        </select>
      </label>
      <label>
        {label} horizontal alignment
        <select value={horizontalValue} onChange={(event) => onHorizontalChange(event.target.value)}>
          <option value="left">Left</option>
          <option value="center">Centre</option>
          <option value="right">Right</option>
        </select>
      </label>
    </>
  );
}

function ShapeControls({ brand, element, onUpdate }) {
  return (
    <>
      <label>
        Shape
        <select
          value={element.shapeType || "rectangle"}
          onChange={(event) => onUpdate({ shapeType: event.target.value })}
        >
          <option value="rectangle">Rectangle</option>
          <option value="roundedRectangle">Rounded rectangle</option>
          <option value="ellipse">Ellipse</option>
          <option value="triangle">Triangle</option>
          <option value="diamond">Diamond</option>
          <option value="pentagon">Pentagon</option>
          <option value="hexagon">Hexagon</option>
          <option value="octagon">Octagon</option>
          <option value="star">Star</option>
          <option value="trapezoid">Trapezoid</option>
          <option value="parallelogram">Parallelogram</option>
          <option value="rightArrow">Right arrow</option>
          <option value="leftArrow">Left arrow</option>
          <option value="upArrow">Up arrow</option>
          <option value="downArrow">Down arrow</option>
          <option value="chevronRight">Chevron right</option>
          <option value="chevronLeft">Chevron left</option>
          <option value="plus">Plus</option>
          <option value="cross">Cross</option>
          <option value="speechBubble">Speech bubble</option>
          <option value="cloud">Cloud</option>
        </select>
      </label>
      <ColorField
        brand={brand}
        fallback="#0c7c78"
        label="Fill color"
        value={element.fillColor || element.background}
        onChange={(color) => onUpdate({ fillColor: color, background: color })}
      />
      <label>
        Fill opacity
        <input
          value={element.fillOpacity ?? 1}
          type="range"
          min="0"
          max="1"
          step="0.05"
          onChange={(event) => onUpdate({ fillOpacity: Number(event.target.value) })}
        />
      </label>
      <label>
        Outline type
        <select
          value={element.outlineStyle || "solid"}
          onChange={(event) => onUpdate({ outlineStyle: event.target.value })}
        >
          <option value="none">None</option>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </label>
      <ColorField
        brand={brand}
        fallback="#17211f"
        label="Outline color"
        value={element.outlineColor || element.borderColor}
        onChange={(color) => onUpdate({ outlineColor: color, borderColor: color })}
      />
      <label>
        Outline opacity
        <input
          value={element.outlineOpacity ?? 1}
          type="range"
          min="0"
          max="1"
          step="0.05"
          onChange={(event) => onUpdate({ outlineOpacity: Number(event.target.value) })}
        />
      </label>
      <label>
        Outline thickness: {element.outlineWidth ?? element.borderWidth ?? 1}
        <input
          value={element.outlineWidth ?? element.borderWidth ?? 1}
          type="range"
          min="1"
          max="50"
          onChange={(event) => onUpdate({ outlineWidth: Number(event.target.value), borderWidth: Number(event.target.value) })}
        />
      </label>
    </>
  );
}

function PreviewPages({ brand, className = "preview-stack", containerId = "previewPage", product, template }) {
  const pages = getTemplatePages(template);
  const pageNumbers = defaultPageNumbers(template);

  return (
    <div id={containerId} className={className}>
      {pages.map((page, pageIndex) => (
        <div
          className={`preview-page size-${template.page.size} ${template.page.orientation}`}
          key={page.id}
          style={pageSurfaceStyle(template.page)}
        >
          {template.elements
            .filter((element) => (element.pageIndex ?? 0) === pageIndex)
            .map((element) => (
              <CanvasElement
                brand={brand}
                element={element}
                isSelected={false}
                key={element.id}
                previewOnly
                product={product}
              />
            ))}
          <PageNumber
            isSelected={false}
            pageIndex={pageIndex}
            pageNumbers={pageNumbers}
            pageTotal={pages.length}
            onSelect={() => {}}
          />
        </div>
      ))}
    </div>
  );
}

function PreviewDialog({ brand, product, template, onClose }) {
  return (
    <div className="dialog-backdrop">
      <section className="preview-dialog">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">Generated preview</p>
            <h2>
              {template.name} · {product.id}
            </h2>
          </div>
          <div className="dialog-actions">
            <button type="button" className="primary-action" onClick={() => printPreviewDocument(template)}>
              Print / save PDF
            </button>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <PreviewPages brand={brand} product={product} template={template} />
      </section>
    </div>
  );
}

function createBlankTemplate() {
  const id = `tpl-${Date.now()}`;
  return {
    id,
    name: "Untitled tech sheet",
    brandId: "voltedge",
    page: {
      size: "A4",
      orientation: "portrait",
      background: "#ffffff",
      backgroundOpacity: 1,
      edgeStyle: "solid",
      edgeColor: "#bac8c4",
      edgeOpacity: 1,
      edgeWidth: 1,
    },
    pages: [{ id: `sheet-${Date.now()}` }],
    elements: [],
  };
}

function makeElementFromItem(item, x, y, brand) {
  if (item.items && item.items.length > 1) {
    return makeAttributeGroupElement(item.items, x, y);
  }

  const source = item.items ? item.items[0] : item;
  if (source.type === "shape") {
    return { ...makeShapeElement(brand), x, y, width: source.width, height: source.height };
  }

  return {
    id: `el-${Date.now()}`,
    type: source.type,
    label: source.label,
    binding: source.binding,
    value: source.value,
    x,
    y,
    width: source.width,
    height: source.height,
    mediaWidth: source.type === "image" || source.type === "logo" ? source.width : undefined,
    mediaHeight: source.type === "image" || source.type === "logo" ? source.height : undefined,
    mediaScaleMode: source.type === "image" || source.type === "logo" ? "fitToElement" : undefined,
    background: source.type === "shape" ? primaryBrandColor(brand) : "#ffffff",
    backgroundOpacity: source.type === "shape" ? 1 : 0,
    borderColor: source.type === "shape" ? primaryBrandColor(brand) : "#cbd8d4",
    borderWidth: source.type === "shape" ? 0 : source.type === "text" || source.type === "table" ? 1 : 0,
    borderRadius: source.type === "shape" ? 0 : 8,
    color: "#17211f",
    fontFamily: "Inter, sans-serif",
    fontSize: source.type === "text" ? 15 : 14,
    displayMode: source.binding ? "valueOnly" : undefined,
    urlDisplayMode: source.urlDisplayMode,
    attributeHorizontalAlign: source.binding ? "left" : undefined,
    attributeVerticalAlign: source.binding ? "top" : undefined,
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function mergeGuidelineIntoBrand(brand, guideline) {
  const colors = guideline.colors.length ? uniqueValues(guideline.colors).slice(0, 12) : brand.colors || [];
  const fonts = guideline.fonts.length ? uniqueValues(guideline.fonts).slice(0, 8) : brand.fonts || [];
  const toneRules = guideline.toneRules.length ? uniqueValues(guideline.toneRules).slice(0, 12) : brand.toneRules || [];

  return {
    ...brand,
    bodyFont: fonts[0] || brand.bodyFont || "Inter",
    colors: colors.length ? colors : brand.colors,
    fonts,
    guidelines: [...(brand.guidelines || []), guideline],
    headingFont: fonts[0] || brand.headingFont || "Inter",
    toneRules,
  };
}

function uniqueValues(items) {
  return [...new Set(items.filter(Boolean))];
}

function brandPalette(brand) {
  return uniqueValues((brand?.colors || []).filter(isHexColor)).slice(0, 12);
}

function remapTemplateColors(template, brandColors) {
  const palette = brandColors.filter(isHexColor);

  return {
    ...template,
    page: { ...template.page, background: template.page.background || "#ffffff" },
    elements: template.elements.map((element) => remapElementColors(element, palette)),
  };
}

function remapElementColors(element, palette) {
  const nextElement = { ...element };
  const colorProps =
    element.type === "shape"
      ? ["background", "borderColor", "color", "fillColor", "outlineColor"]
      : ["borderColor", "color", "outlineColor"];

  if (palette.length > 0) {
    colorProps.forEach((prop) => {
      nextElement[prop] = nearestBrandColor(nextElement[prop], palette);
    });
  }

  if (element.type !== "shape") {
    nextElement.background = "#ffffff";
    nextElement.backgroundOpacity = element.backgroundOpacity ?? 0;
  }

  return nextElement;
}

function nearestBrandColor(color, palette) {
  if (!isHexColor(color)) return color;
  let nearest = palette[0];
  let shortestDistance = Number.POSITIVE_INFINITY;
  const source = hexToRgb(color);

  palette.forEach((candidate) => {
    const target = hexToRgb(candidate);
    const distance =
      (source.r - target.r) ** 2 +
      (source.g - target.g) ** 2 +
      (source.b - target.b) ** 2;
    if (distance < shortestDistance) {
      shortestDistance = distance;
      nearest = candidate;
    }
  });

  return nearest;
}

function hexToRgb(color) {
  const normalized = color.length === 4 ? normalizeShortHex(color) : color;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function isHexColor(color) {
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color || "");
}

function normalizeShortHex(color) {
  return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
}

function primaryBrandColor(brand) {
  return brand?.colors?.[0] || "#0c7c78";
}

function pimRequestUrl({ apiKey, baseUrl, path, query, replacements }) {
  const base = (baseUrl || "").trim();
  const template = interpolatePimPath(path || "", replacements);
  const fallbackPath = template || "";
  if (!base && !/^https?:\/\//i.test(fallbackPath)) {
    throw new Error("Base URL is required.");
  }

  const requestUrl = /^https?:\/\//i.test(fallbackPath)
    ? new URL(fallbackPath)
    : new URL(fallbackPath || "/", `${base.replace(/\/+$/, "")}/`);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (!hasQueryPlaceholder(path || "", key) && !requestUrl.searchParams.has(key)) {
      requestUrl.searchParams.set(key, value);
    }
  });

  return appendAccessToken(requestUrl.toString(), apiKey?.trim());
}

function pimRequestOptions(settings) {
  const headers = { Accept: "application/json" };
  return { method: "GET", headers };
}

function pimRequestDetails(settings) {
  const url = pimRequestUrl(settings);
  const options = pimRequestOptions(settings);
  const apiKeyLabel = settings.apiKeyLabel || "API key/code";
  const sentApiKey = settings.apiKey?.trim() || tokenFromUrl(url);

  return {
    url,
    options,
    diagnostics: {
      method: options.method,
      url: maskAccessTokenInUrl(url),
      authorizationKey: sentApiKey ? `access_token query parameter (${apiKeyLabel})` : "Not sent",
      authorizationValue: sentApiKey ? maskSecret(sentApiKey) : "No API code entered",
    },
  };
}

function normalizePimChannels(payload) {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.channels)
      ? payload.channels
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.results)
          ? payload.results
          : [];

  return source
    .map((channel) => {
      const id = channel?.id;
      const name = channel?.name || channel?.title || channel?.channel_name || channel?.channelName;
      const token = extractChannelApiToken(channel?.dataAPIKeys);
      if (id == null || !name) return null;
      return {
        id: String(id),
        name: String(name),
        isApiChannel: Boolean(channel?.dataAPIKeys),
        token,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function extractChannelApiToken(dataApiKeys) {
  if (!dataApiKeys) return "";
  if (typeof dataApiKeys === "string") return dataApiKeys.trim();

  if (Array.isArray(dataApiKeys)) {
    for (const entry of dataApiKeys) {
      const token = extractChannelApiToken(entry);
      if (token) return token;
    }
    return "";
  }

  if (typeof dataApiKeys === "object") {
    const directTokenKeys = ["token", "access_token", "accessToken", "key", "apiKey", "value"];
    for (const key of directTokenKeys) {
      if (typeof dataApiKeys[key] === "string" && dataApiKeys[key].trim()) {
        return dataApiKeys[key].trim();
      }
    }

    for (const value of Object.values(dataApiKeys)) {
      const token = extractChannelApiToken(value);
      if (token) return token;
    }
  }

  return "";
}

function interpolatePimPath(path, replacements = {}) {
  return Object.entries(replacements).reduce((nextPath, [key, value]) => {
    const safeValue = value == null ? "" : String(value);
    const patterns = [
      new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "gi"),
      new RegExp(`:${escapeRegExp(key)}\\b`, "g"),
    ];
    return patterns.reduce((currentPath, pattern) => currentPath.replace(pattern, safeValue), nextPath);
  }, path);
}

function hasQueryPlaceholder(path, key) {
  if (!path) return false;
  return new RegExp(`([?&])${escapeRegExp(key)}=`, "i").test(path) || new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "i").test(path);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function appendAccessToken(url, apiKey) {
  if (!apiKey || /[?&]access_token=/i.test(url)) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}access_token=${encodeURIComponent(apiKey)}`;
}

function tokenFromUrl(url) {
  try {
    return new URL(url).searchParams.get("access_token") || "";
  } catch {
    return "";
  }
}

function maskAccessTokenInUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const token = parsedUrl.searchParams.get("access_token");
    if (token) parsedUrl.searchParams.set("access_token", maskSecret(token));
    return parsedUrl.toString();
  } catch {
    return url.replace(/(access_token=)([^&]+)/i, (_, prefix, token) => `${prefix}${maskSecret(token)}`);
  }
}

function maskSecret(value) {
  if (value.length <= 8) return `${"*".repeat(value.length)} (${value.length} chars)`;
  return `${value.slice(0, 4)}...${value.slice(-4)} (${value.length} chars)`;
}

function pimErrorMessage(error) {
  if (error?.message === "Failed to fetch") {
    return "GET request failed before the app could read a response. Check the URL/token, network access, and whether the PIM allows browser CORS requests.";
  }
  return error?.message || "Could not access the PIM.";
}

function normalizePimProducts(payload) {
  return findProductArray(payload).map((item, index) => normalizePimProduct(item, index)).filter(Boolean);
}

function findProductArray(payload) {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.products,
    payload?.items,
    payload?.data,
    payload?.results,
    payload?.records,
    payload?.response?.products,
    payload?.response?.items,
    payload?.data?.products,
    payload?.data?.items,
  ];
  const arrayCandidate = candidates.find(Array.isArray);
  if (arrayCandidate) return arrayCandidate;
  const objectCandidate = candidates.find((candidate) => candidate && typeof candidate === "object");
  if (objectCandidate) return productMapToArray(objectCandidate);
  if (payload && typeof payload === "object") return productMapToArray(payload);
  return [];
}

function productMapToArray(productMap) {
  return Object.entries(productMap)
    .filter(([, value]) => value && typeof value === "object")
    .map(([primaryId, value]) => ({
      "Primary ID": primaryId,
      id: primaryId,
      productId: primaryId,
      ...value,
    }));
}

function normalizePimProduct(item, index) {
  if (!item || typeof item !== "object") return null;

  const structuredAssetSources = mergeStructuredAssetSources(item);
  const rawAttributes = item.attributes && typeof item.attributes === "object" && !Array.isArray(item.attributes)
    ? normalizeAttributeObject(item.attributes)
    : topLevelAttributes(item);
  const assets = dedupeAssetMapByUrl({
    ...assetUrlsFromObject(item),
    ...assetUrlsFromObject(item.attributes || {}),
    ...normalizeAssetObject(structuredAssetSources),
  });
  const urlAttributes = urlAttributesFromObject(structuredAssetSources);
  const id = String(firstValue(item, ["Primary ID", "primary ID", "primaryId", "primary_id", "id", "productId", "productID", "Product ID", "sku", "SKU", "code", "key"]) || rawAttributes["Primary ID"] || rawAttributes.primaryId || rawAttributes.productId || rawAttributes.sku || `PIM-${index + 1}`);
  const name = String(firstValue(item, ["Product Name", "name", "productName", "title", "label"]) || rawAttributes["Product Name"] || rawAttributes.productName || id);
  const category = String(firstValue(item, ["Category", "category", "categoryName", "family", "type"]) || rawAttributes.Category || rawAttributes.category || "Uncategorised");
  const thumbnail = firstValue(item, ["thumbnail", "thumbnailUrl", "image", "imageUrl"]) || firstAssetUrl(assets) || "";

  return {
    id,
    name,
    category,
    thumbnail,
    attributes: {
      ...filterDisplayAttributes({
        productId: id,
        productName: name,
        category,
        ...rawAttributes,
        ...urlAttributes,
      }, assets),
    },
    assets,
    raw: item,
  };
}

function mergeStructuredAssetSources(item) {
  return {
    ...(item.assets && typeof item.assets === "object" ? item.assets : {}),
    ...(item.digitalAssets && typeof item.digitalAssets === "object" ? item.digitalAssets : {}),
    ...(item.media && typeof item.media === "object" ? item.media : {}),
    ...(item.images && typeof item.images === "object" ? item.images : {}),
    ...(item.files && typeof item.files === "object" ? item.files : {}),
  };
}

function normalizeAttributeObject(attributes) {
  return flattenAttributeEntries(attributes);
}

function topLevelAttributes(item) {
  const ignored = new Set(["assets", "digitalAssets", "media", "images", "files", "thumbnail", "thumbnailUrl", "image", "imageUrl", "raw"]);
  return Object.entries(item).reduce((next, [key, value]) => {
    if (ignored.has(key)) return next;
    const flattened = flattenAttributeEntries(value, key);
    return { ...next, ...flattened };
  }, {});
}

function normalizeAttributeValue(value) {
  if (value === null || value === undefined) return undefined;
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (Array.isArray(value)) {
    const values = value.map(normalizeAttributeValue).filter(Boolean);
    return values.length ? values.join(", ") : undefined;
  }
  if (typeof value === "object") {
    return value.value ?? value.label ?? value.name ?? value.text ?? firstValue(value, ["url", "publicUrl", "cdnUrl", "href", "src", "downloadUrl"]) ?? undefined;
  }
  return undefined;
}

function normalizeAssetObject(assets) {
  return flattenAssetEntries(assets);
}

function dedupeAssetMapByUrl(assets) {
  const seenUrls = new Set();
  return Object.entries(assets || {}).reduce((next, [key, value]) => {
    const normalizedUrl = typeof value === "string" ? value.trim() : value;
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) return next;
    seenUrls.add(normalizedUrl);
    next[key] = normalizedUrl;
    return next;
  }, {});
}

function filterDisplayAttributes(attributes, assets = {}) {
  const assetUrls = new Set(
    Object.values(assets)
      .map(canonicalizeAssetUrl)
      .filter(Boolean),
  );

  return Object.entries(attributes || {}).reduce((next, [key, value]) => {
    if (normalizeLookupToken(key) === "link") return next;
    if (looksLikeUrl(value) && assetUrls.has(canonicalizeAssetUrl(value))) return next;
    next[key] = value;
    return next;
  }, {});
}

function urlAttributesFromObject(source) {
  if (!source || typeof source !== "object") return {};
  if (Array.isArray(source)) {
    return source.reduce((next, asset, index) => {
      const url = typeof asset === "string" ? asset : firstValue(asset, ["url", "publicUrl", "cdnUrl", "href", "src", "downloadUrl"]);
      if (url && assetKindFromValue(asset, url) === "url") {
        next[asset?.label || asset?.name || `link${index + 1}`] = url;
      }
      return next;
    }, {});
  }

  return Object.entries(source).reduce((next, [key, value]) => {
    const url = typeof value === "string" ? value : firstValue(value, ["url", "publicUrl", "cdnUrl", "href", "src", "downloadUrl"]);
    if (url && assetKindFromValue(value, url) === "url") next[key] = url;
    return next;
  }, {});
}

function assetUrlsFromObject(source) {
  return flattenAssetEntries(source);
}

function assetUrlFromValue(value) {
  if (typeof value === "string" && assetKindFromValue(value, value) === "image") return value;
  if (Array.isArray(value)) {
    return value.find((item) => assetKindFromValue(item, typeof item === "string" ? item : firstValue(item, ["url", "publicUrl", "cdnUrl", "href", "src", "downloadUrl", "value"])) === "image") || "";
  }
  if (value && typeof value === "object") {
    const url = firstValue(value, ["url", "publicUrl", "cdnUrl", "href", "src", "downloadUrl", "value"]);
    if (assetKindFromValue(value, url) === "image") return url;
  }
  return "";
}

function flattenAttributeEntries(source, prefix = "") {
  const next = {};

  function visit(value, keyPrefix) {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      if (value.every((item) => item === null || item === undefined || ["string", "number", "boolean"].includes(typeof item))) {
        const normalizedValue = normalizeAttributeValue(value);
        if (keyPrefix && normalizedValue !== undefined) next[keyPrefix] = normalizedValue;
        return;
      }

      value.forEach((item, index) => {
        if (looksLikeAttributeDescriptor(item)) {
          const attributeKey = firstValue(item, ["attribute", "attributeKey", "key", "name", "label", "code", "id"]);
          const attributeValue = firstValue(item, ["value", "text", "data", "attributeValue", "val"]);
          if (attributeKey && attributeValue !== undefined && assetKindFromValue(item, String(attributeValue)) !== "image") {
            next[String(attributeKey)] = String(attributeValue);
            return;
          }
        }
        visit(item, keyPrefix || `${prefix || "item"}${index + 1}`);
      });
      return;
    }

    if (["string", "number", "boolean"].includes(typeof value)) {
      if (keyPrefix) next[keyPrefix] = String(value);
      return;
    }

    if (typeof value !== "object") return;

    const normalizedValue = normalizeAttributeValue(value);
    if (keyPrefix && normalizedValue !== undefined && assetKindFromValue(value, normalizedValue) !== "image") {
      const childKeys = Object.keys(value).filter((key) => !["value", "label", "name", "text"].includes(key));
      if (childKeys.length === 0 || looksLikeUrl(normalizedValue)) {
        next[keyPrefix] = normalizedValue;
        return;
      }
    }

    Object.entries(value).forEach(([childKey, childValue]) => {
      const nextKey = keyPrefix || childKey;
      if (["value", "text"].includes(childKey) && keyPrefix) {
        visit(childValue, keyPrefix);
        return;
      }
      if (["label", "name"].includes(childKey) && keyPrefix) return;
      visit(childValue, keyPrefix ? `${keyPrefix}.${childKey}` : childKey);
    });
  }

  visit(source, prefix);
  return next;
}

function flattenAssetEntries(source, prefix = "") {
  const next = {};

  function visit(value, keyPrefix) {
    if (value === null || value === undefined) return;

    const directUrl = assetUrlFromValue(value);
    if (directUrl) {
      next[keyPrefix || "image"] = directUrl;
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const label = typeof item === "object" && item
          ? firstValue(item, ["label", "name", "title", "key"]) || `${keyPrefix || "asset"}${index + 1}`
          : `${keyPrefix || "asset"}${index + 1}`;
        visit(item, String(label));
      });
      return;
    }

    if (!value || typeof value !== "object") return;

    Object.entries(value).forEach(([childKey, childValue]) => {
      const nextKey = keyPrefix ? `${keyPrefix}.${childKey}` : childKey;
      visit(childValue, nextKey);
    });
  }

  visit(source, prefix);
  return next;
}

function looksLikeAttributeDescriptor(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      firstValue(value, ["attribute", "attributeKey", "key", "name", "label", "code", "id"]) &&
      firstValue(value, ["value", "text", "data", "attributeValue", "val"]) !== undefined,
  );
}

function firstValue(source, keys) {
  return keys.map((key) => source?.[key]).find((value) => value !== undefined && value !== null && value !== "");
}

function firstAssetUrl(assets) {
  return Object.values(assets).find(looksLikeUrl);
}

function looksLikeUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function looksLikeImageAssetUrl(value) {
  if (!looksLikeUrl(value)) return false;
  try {
    const { pathname } = new URL(value);
    return /\.(jpe?g|png|gif|webp|svg|bmp|tiff?)$/i.test(pathname);
  } catch {
    return /\.(jpe?g|png|gif|webp|svg|bmp|tiff?)(?:[?#].*)?$/i.test(value);
  }
}

function assetKindFromValue(source, url) {
  if (!looksLikeUrl(url)) return "";
  const metadata = typeof source === "object" && source
    ? [
        source.mimeType,
        source.contentType,
        source.mediaType,
        source.type,
        source.extension,
        source.ext,
        source.fileName,
        source.filename,
        source.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
    : "";

  if (looksLikeImageAssetUrl(url) || /\bimage\/|\.jpe?g\b|\.png\b|\.gif\b|\.webp\b|\.svg\b|\.bmp\b|\.tiff?\b/.test(metadata)) {
    return "image";
  }

  if (
    looksLikeUrl(url) &&
    (/\bapplication\/pdf\b|\bvideo\/|\baudio\/|\bdocument\b|\.pdf\b|\.mp4\b|\.mov\b|\.webm\b|\.zip\b|\.docx?\b|\.pptx?\b|\.xlsx?\b/.test(metadata) ||
      !looksLikeImageAssetUrl(url))
  ) {
    return "url";
  }

  return "";
}

function placeholderThumbnail(label = "P") {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "P";
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="12" fill="#e5efec"/><text x="60" y="68" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="#17211f">${initials}</text></svg>`)}`;
}

function moveElementInLayer(elements, elementId, action) {
  const selectedElement = elements.find((element) => element.id === elementId);
  if (!selectedElement) return elements;

  const pageIndex = selectedElement.pageIndex ?? 0;
  const pageElements = elements.filter((element) => (element.pageIndex ?? 0) === pageIndex);
  const currentIndex = pageElements.findIndex((element) => element.id === elementId);
  if (currentIndex === -1) return elements;

  let targetIndex = currentIndex;
  if (action === "front") targetIndex = pageElements.length - 1;
  if (action === "back") targetIndex = 0;
  if (action === "forward") targetIndex = Math.min(currentIndex + 1, pageElements.length - 1);
  if (action === "backward") targetIndex = Math.max(currentIndex - 1, 0);
  if (targetIndex === currentIndex) return elements;

  const reorderedPageElements = [...pageElements];
  const [movedElement] = reorderedPageElements.splice(currentIndex, 1);
  reorderedPageElements.splice(targetIndex, 0, movedElement);
  let nextPageElementIndex = 0;

  return elements.map((element) => {
    if ((element.pageIndex ?? 0) !== pageIndex) return element;
    const nextElement = reorderedPageElements[nextPageElementIndex];
    nextPageElementIndex += 1;
    return nextElement;
  });
}

function makeShapeElement(brand) {
  const primaryColor = primaryBrandColor(brand);
  return {
    id: `el-${Date.now()}`,
    type: "shape",
    label: "Shape",
    x: 0,
    y: 0,
    width: 190,
    height: 110,
    shapeType: "rectangle",
    fillColor: primaryColor,
    fillOpacity: 1,
    outlineStyle: "solid",
    outlineColor: "#17211f",
    outlineOpacity: 1,
    outlineWidth: 1,
    background: primaryColor,
    borderColor: "#17211f",
    borderWidth: 1,
    borderRadius: 0,
  };
}

function makeTextElement() {
  return {
    id: `el-${Date.now()}`,
    type: "text",
    label: "Text",
    value: "Add supporting copy",
    x: 0,
    y: 0,
    width: 220,
    height: 90,
    background: "#ffffff",
    backgroundOpacity: 0,
    borderColor: "#cbd8d4",
    borderWidth: 0,
    borderRadius: 8,
    color: "#17211f",
    fontFamily: "Inter, sans-serif",
    fontSize: 15,
    contentHorizontalAlign: "left",
    contentVerticalAlign: "top",
  };
}

function makeAttributeGroupElement(items, x, y) {
  return {
    id: `el-${Date.now()}`,
    type: "attributeGroup",
    label: `${items.length} attributes`,
    fields: items.map(({ binding, height, label, type, urlDisplayMode, value, width }) => ({
      binding,
      height,
      label,
      type,
      urlDisplayMode,
      value,
      width,
    })),
    x,
    y,
    width: 300,
    height: Math.max(120, items.length * 54),
    background: "#ffffff",
    backgroundOpacity: 0,
    borderColor: "#cbd8d4",
    borderWidth: 1,
    borderRadius: 8,
    color: "#17211f",
    fontFamily: "Inter, sans-serif",
    fontSize: 13,
    displayMode: "none",
    attributeHorizontalAlign: "left",
    attributeVerticalAlign: "top",
  };
}

function getProductFieldItems(product) {
  const assetUrls = new Set(
    Object.values(product.assets || {})
      .map(canonicalizeAssetUrl)
      .filter(Boolean),
  );

  return dedupeFieldItems([
    ...Object.entries(product.attributes)
      .filter(([key, value]) => !shouldHideAttributeField(key, value, assetUrls))
      .map(([key, value]) => ({
        type: "text",
        label: labelize(key),
        binding: `attributes.${key}`,
        urlDisplayMode: looksLikeUrl(value) ? "link" : undefined,
        value,
        width: key === "description" ? 240 : 180,
        height: key === "description" ? 90 : 46,
      })),
    ...Object.keys(product.assets).map((key) => ({
      type: "image",
      label: labelize(key),
      binding: `assets.${key}`,
      value: product.assets[key],
      width: 220,
      height: 170,
    })),
  ]);
}

function getProductSourceInfo(product, sourceInfo = {}) {
  const accountName = sourceInfo.accountName || findProductSourceValue(product, ["accountname", "account", "pimaccountname"]);
  const channelName = sourceInfo.channelName || findProductSourceValue(product, ["channelname", "channel", "channeltitle"]);
  if (!accountName && !channelName) return null;
  return { accountName, channelName };
}

function extractProductSourceInfo(payload) {
  return {
    accountName: findValueByNormalizedKeys(payload, ["accountname", "account", "pimaccountname"]),
    channelName: findValueByNormalizedKeys(payload, ["channelname", "channel", "channeltitle"]),
  };
}

function findProductSourceValue(product, normalizedKeys) {
  const attributeValue = findValueByNormalizedKeys(product?.attributes, normalizedKeys);
  if (attributeValue) return attributeValue;
  return findValueByNormalizedKeys(product?.raw, normalizedKeys);
}

function findValueByNormalizedKeys(source, normalizedKeys) {
  if (!source || typeof source !== "object") return "";
  const allowedKeys = new Set(normalizedKeys);

  for (const [key, value] of Object.entries(source)) {
    if (allowedKeys.has(normalizeLookupToken(key))) {
      const normalizedValue = normalizeAttributeValue(value);
      if (normalizedValue) return normalizedValue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nestedValue = findValueByNormalizedKeys(value, normalizedKeys);
      if (nestedValue) return nestedValue;
    }
  }

  return "";
}

function shouldHideAttributeField(key, value, assetUrls) {
  if (!looksLikeUrl(value)) return false;
  const canonicalUrl = canonicalizeAssetUrl(value);
  const normalizedKey = normalizeLookupToken(key);
  if (assetUrls.has(canonicalUrl)) return true;
  if (looksLikeImageAssetUrl(value) && /(webimage|image|images|thumbnail|picture|photo)/.test(normalizedKey)) return true;
  return false;
}

function dedupeFieldItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (item.type === "image") {
      const imageKey = `${normalizeLookupToken(item.label)}::${canonicalizeAssetUrl(item.value)}`;
      if (seen.has(imageKey)) return false;
      seen.add(imageKey);
      return true;
    }

    const fieldKeyValue = `${item.type}::${item.binding || item.label}`;
    if (seen.has(fieldKeyValue)) return false;
    seen.add(fieldKeyValue);
    return true;
  });
}

function canonicalizeAssetUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const parsedUrl = new URL(value);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return value.split(/[?#]/)[0];
  }
}

function normalizeLookupToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function copyField(field) {
  const { binding, height, label, type, urlDisplayMode, value, width } = field;
  return { binding, height, label, type, urlDisplayMode, value, width };
}

function resizeElement(original, direction, dx, dy, canvasBounds) {
  let nextX = original.x;
  let nextY = original.y;
  let nextWidth = original.width;
  let nextHeight = original.height;
  const minWidth = 40;
  const minHeight = 24;

  if (direction.includes("e")) {
    nextWidth = clamp(original.width + dx, minWidth, canvasBounds.width - original.x);
  }

  if (direction.includes("s")) {
    nextHeight = clamp(original.height + dy, minHeight, canvasBounds.height - original.y);
  }

  if (direction.includes("w")) {
    const maxLeftMove = original.width - minWidth;
    const leftMove = clamp(dx, -original.x, maxLeftMove);
    nextX = original.x + leftMove;
    nextWidth = original.width - leftMove;
  }

  if (direction.includes("n")) {
    const maxUpMove = original.height - minHeight;
    const upMove = clamp(dy, -original.y, maxUpMove);
    nextY = original.y + upMove;
    nextHeight = original.height - upMove;
  }

  return { x: nextX, y: nextY, width: nextWidth, height: nextHeight };
}

function getMediaSize(element) {
  if (elementScalesMediaWithBox(element)) {
    return {
      width: element.width,
      height: element.height,
    };
  }

  return {
    width: element.mediaWidth ?? Math.round(element.width * 1.35),
    height: element.mediaHeight ?? Math.round(element.height * 1.35),
  };
}

function elementScalesMediaWithBox(element) {
  return (element.type === "image" || element.type === "logo") && element.mediaScaleMode !== "crop";
}

function specRows(product) {
  const preferredKeys = ["productId", "category", "voltage", "enclosure", "operatingTemp", "warranty"];
  const preferredRows = preferredKeys
    .filter((key) => product.attributes[key])
    .map((key) => [labelize(key), product.attributes[key]]);
  if (preferredRows.length >= 2) return preferredRows;
  return Object.entries(product.attributes).slice(0, 8).map(([key, value]) => [labelize(key), value]);
}

function resolveBinding(product, path) {
  if (!path) return "";
  return path.split(".").reduce((value, key) => (value ? value[key] : ""), product) || "";
}

function labelize(key) {
  return key
    .replace(/[.]+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function fieldSubtitle(item) {
  if (item.type === "image") return item.value ? truncateValue(item.value) : "Dynamic product asset";
  if (item.type === "logo") return "Brand library asset";
  if (item.type === "shape") return "Backgrounds, edges, panels";
  if (item.type === "table") return "Bound product specifications";
  return item.binding ? truncateValue(item.value) : "Static copy";
}

function truncateValue(value) {
  const text = String(value ?? "");
  if (!text) return "No value";
  return text.length > 72 ? `${text.slice(0, 69)}...` : text;
}

function fieldMatchesElement(item, element) {
  if (!element) return false;
  if (element.fields) return element.fields.some((field) => fieldKey(field) === fieldKey(item));
  if (item.binding && element.binding) return item.binding === element.binding;
  if (item.type === "logo" && element.type === "logo") return true;
  if (item.type === "table" && element.type === "table") return true;
  return !item.binding && item.type === element.type && item.label === element.label;
}

function fieldIsUsed(item, elements) {
  return elements.some((element) => fieldMatchesElement(item, element));
}

function elementSupportsUrlDisplay(element, product) {
  if (element?.fields?.length) return elementHasUrlAttributes(element, product);
  if (!element?.binding) return false;
  return looksLikeUrl(resolveBinding(product, element.binding));
}

function elementHasUrlAttributes(element, product) {
  return getElementFields(element).some((field) => {
    if (field.type === "image" || field.type === "logo") return false;
    const value = field.binding ? resolveBinding(product, field.binding) : field.value;
    return looksLikeUrl(value);
  });
}

function fieldKey(item) {
  return item.binding || `${item.type}:${item.label}`;
}

function makeDragPayload(items) {
  if (items.length === 1) return items[0];
  return {
    items,
    width: 300,
    height: Math.max(120, items.length * 54),
  };
}

function hasAttributeBindings(element) {
  return Boolean(element?.binding || element?.fields?.length);
}

function shouldRenderAttributeContent(element) {
  if (!element) return false;
  if (element.type === "attributeGroup") return true;
  if (!element.binding) return false;
  return element.type !== "image" && element.type !== "logo" && element.type !== "table";
}

function elementHasText(element) {
  if (!element) return false;
  if (element.type === "text" || element.type === "table" || element.type === "attributeGroup") return true;
  if (element.fields?.some((field) => field.type !== "image" && field.type !== "logo")) return true;
  return Boolean(element.binding && element.type !== "image" && element.type !== "logo");
}

function getElementFields(element) {
  if (element.fields?.length) return element.fields;
  if (!element.binding) return [];
  return [
    {
      binding: element.binding,
      label: element.label,
      type: element.type,
      urlDisplayMode: element.urlDisplayMode,
      value: element.value,
      width: element.width,
      height: element.height,
    },
  ];
}

function defaultPageNumbers(template) {
  return {
    mode: "none",
    fontFamily: "Inter, sans-serif",
    color: optimizedTextColor(template.page.background),
    fontSize: 12,
    horizontalAlign: "center",
    verticalAlign: "bottom",
    ...(template.pageNumbers || {}),
  };
}

function defaultBorderColor(element) {
  if (element.type === "shape") return element.background || "#0c7c78";
  return "#cbd8d4";
}

function elementBackgroundColor(element) {
  return rgbaColor(colorInputValue(element.background, "#ffffff"), elementBackgroundOpacity(element));
}

function elementBackgroundOpacity(element) {
  if (element.backgroundOpacity !== undefined) return clamp(Number(element.backgroundOpacity), 0, 1);
  if (!element.background || element.background === "transparent") return 0;
  if (element.background === "#ffffff") return 0;
  return 1;
}

function formatPageNumber(mode, pageIndex, pageTotal) {
  if (mode === "page") return `Page ${pageIndex + 1}`;
  if (mode === "pageOfTotal") return `Page ${pageIndex + 1} of ${pageTotal}`;
  return "";
}

function optimizedTextColor(background) {
  if (!isHexColor(background)) return "#17211f";
  const { r, g, b } = hexToRgb(background);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "#17211f" : "#ffffff";
}

function pageSurfaceStyle(page = {}) {
  const edgeStyle = page.edgeStyle || "solid";
  const edgeWidth = page.edgeWidth ?? 1;

  return {
    background: rgbaColor(page.background || "#ffffff", page.backgroundOpacity ?? 1),
    borderStyle: edgeStyle,
    borderWidth: edgeStyle === "none" ? "0" : `${edgeWidth}px`,
    borderColor: rgbaColor(page.edgeColor || "#bac8c4", page.edgeOpacity ?? 1),
  };
}

function rgbaColor(color, opacity = 1) {
  const alpha = clamp(Number(opacity), 0, 1);
  if (!isHexColor(color)) return color || `rgba(255, 255, 255, ${alpha})`;
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function pageNumberStyle(pageNumbers, pageIndex) {
  const manualPosition = pageNumbers.manualPositions?.[pageIndex];
  if (manualPosition) {
    return {
      left: `${manualPosition.x}px`,
      top: `${manualPosition.y}px`,
      transform: "none",
      color: pageNumbers.color,
      fontFamily: pageNumbers.fontFamily,
      fontSize: `${pageNumbers.fontSize}px`,
    };
  }

  const horizontal = {
    left: { left: "28px", transform: "none" },
    center: { left: "50%", transform: "translateX(-50%)" },
    right: { right: "28px", transform: "none" },
  }[pageNumbers.horizontalAlign] || { left: "50%", transform: "translateX(-50%)" };
  const vertical = pageNumbers.verticalAlign === "top" ? { top: "18px" } : { bottom: "18px" };

  return {
    ...horizontal,
    ...vertical,
    color: pageNumbers.color,
    fontFamily: pageNumbers.fontFamily,
    fontSize: `${pageNumbers.fontSize}px`,
  };
}

function defaultBorderWidth(element) {
  if (element.type === "text" || element.type === "table") return 1;
  return 0;
}

function outlineDashArray(style, width) {
  if (style === "dashed") return `${Math.max(width * 3, 6)} ${Math.max(width * 2, 4)}`;
  if (style === "dotted") return `0 ${Math.max(width * 2, 4)}`;
  return undefined;
}

function horizontalAlignToFlex(alignment = "left") {
  if (alignment === "center") return "center";
  if (alignment === "right") return "flex-end";
  return "flex-start";
}

function pageDimensions(page) {
  const sizes = {
    A4: { portrait: { width: 595, height: 842 }, landscape: { width: 842, height: 595 } },
    Letter: { portrait: { width: 612, height: 792 }, landscape: { width: 792, height: 612 } },
  };
  return sizes[page.size]?.[page.orientation] ?? sizes.A4.portrait;
}

function verticalAlignToFlex(alignment = "top") {
  if (alignment === "center") return "center";
  if (alignment === "bottom") return "flex-end";
  return "flex-start";
}

function getTemplatePages(template) {
  return template.pages?.length ? template.pages : [{ id: "sheet-1" }];
}

function radiusPresetValue(radius) {
  const presets = ["0", "4", "8", "16"];
  const value = String(radius);
  return presets.includes(value) ? value : "custom";
}

function colorInputValue(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function roundZoom(value) {
  return Math.round(value * 100) / 100;
}

function pageCanvasFromPoint(clientX, clientY) {
  return Array.from(document.querySelectorAll(".page-canvas")).find((pageCanvas) => {
    const bounds = pageCanvas.getBoundingClientRect();
    return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom;
  });
}

function printPreviewDocument(template) {
  const preview = document.getElementById("previewPage");
  if (!preview) return;

  const frame = document.createElement("iframe");
  frame.className = "print-frame";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);

  const frameDocument = frame.contentDocument || frame.contentWindow?.document;
  if (!frameDocument) {
    frame.remove();
    return;
  }

  const documentStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("\n");
  const printSize = `${template.page.size} ${template.page.orientation}`;
  const printScale = printScaleForWorkspace();

  frameDocument.open();
  frameDocument.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(template.name)} print preview</title>
    ${documentStyles}
    <style>
      @page { size: ${printSize}; margin: 0; }
      html, body {
        margin: 0;
        padding: 0;
        min-width: 0;
        background: #ffffff;
      }
      #previewPage {
        display: block;
        gap: 0 !important;
        margin: 0;
        padding: 0;
      }
      .preview-page {
        margin: 0 auto !important;
        box-shadow: none !important;
        box-sizing: border-box !important;
        transform-origin: top left;
        zoom: ${printScale};
        break-after: page;
        page-break-after: always;
      }
      .preview-page:last-child {
        break-after: auto;
        page-break-after: auto;
      }
    </style>
  </head>
  <body>
    <div id="previewPage" class="preview-stack">${preview.innerHTML}</div>
  </body>
</html>`);
  frameDocument.close();

  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 100);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function printScaleForWorkspace() {
  return 96 / 72;
}

function collectDocumentCssText() {
  return Array.from(document.styleSheets)
    .map((styleSheet) => {
      try {
        return Array.from(styleSheet.cssRules || []).map((rule) => rule.cssText).join("\n");
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n");
}

function pdfFileName(productId) {
  return `${sanitizeFilePart(productId || "product")}_TechSheet_${pdfTimestamp()}.pdf`;
}

function pdfTimestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];
  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`;
}

function sanitizeFilePart(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "file";
}

function qrCodeUrl(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&qzone=2&margin=0&data=${encodeURIComponent(value)}`;
}
