/* ========================================
   すなけ字幕変換ツール MK.IV
   レイヤー・YTT・VTT・音声動画同期対応
======================================== */
const $ = id => document.getElementById(id);
const textInput = $("textInput");
const preview = $("preview");
const previewGuide = $("previewGuide");
const videoPreview = $("videoPreview");
const audioPlayer = $("audioPlayer");
const mediaFileInput = $("mediaFileInput");
const clearMediaButton = $("clearMediaButton");
const mediaFileName = $("mediaFileName");
const selectedTextName = $("selectedTextName");
const positionX = $("positionX");
const positionY = $("positionY");
const applyPositionButton = $("applyPositionButton");
const deleteTextButton = $("deleteTextButton");
const textList = $("textList");
const layerList = $("layerList");
const addLayerButton = $("addLayerButton");
const selectedLayerName = $("selectedLayerName");
const startTime = $("startTime");
const endTime = $("endTime");
const applyLayerTimeButton = $("applyLayerTimeButton");
const fontSize = $("fontSize");
const fontColor = $("fontColor");
const fontColorValue = $("fontColorValue");
const applyFontSizeButton = $("applyFontSizeButton");
const saveButton = $("saveButton");
const loadButton = $("loadButton");
const fileInput = $("fileInput");
const playButton = $("playButton");
const stopButton = $("stopButton");
const playbackTime = $("playbackTime");
const playbackProgress = $("playbackProgress");
const exportVttButton = $("exportVttButton");
const exportYttButton = $("exportYttButton");
const exportFileName = $("exportFileName");
const status = $("status");
/* ========================================
   データ
======================================== */
let layers = [];
let selectedLayerId = null;
let selectedTextId = null;
let nextLayerId = 1;
let nextTextId = 1;
let isPlaying = false;
let playbackPosition = 0;
let playbackStartedAt = 0;
let playbackTimer = null;
let lastPlaybackLayerKey = null;
let mediaObjectUrl = null;
/* ========================================
   取り消し・やり直し用の履歴
======================================== */
const undoButton = $("undoButton");
const redoButton = $("redoButton");

const undoStack = [];
const redoStack = [];
const HISTORY_LIMIT = 100;

function createHistorySnapshot() {
  return {
    layers: JSON.parse(JSON.stringify(layers)),
    selectedLayerId,
    selectedTextId,
    nextLayerId,
    nextTextId
  };
}

function updateHistoryButtons() {
  undoButton.disabled = undoStack.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

function recordHistory() {
  undoStack.push(createHistorySnapshot());

  if (undoStack.length > HISTORY_LIMIT) {
    undoStack.shift();
  }

  // 新しい編集をしたら、以前の「やり直し」は無効になる
  redoStack.length = 0;

  updateHistoryButtons();
}

function restoreHistorySnapshot(snapshot) {
  layers = JSON.parse(JSON.stringify(snapshot.layers));
  selectedLayerId = snapshot.selectedLayerId;
  selectedTextId = snapshot.selectedTextId;
  nextLayerId = snapshot.nextLayerId;
  nextTextId = snapshot.nextTextId;

  // 選択対象が存在しない場合は選択を解除する
  if (!layers.some(layer => layer.id === selectedLayerId)) {
    selectedLayerId = null;
    selectedTextId = null;
  }

  const selectedLayer = getSelectedLayer();

  if (
    selectedLayer &&
    !selectedLayer.texts.some(text => text.id === selectedTextId)
  ) {
    selectedTextId = null;
  }

  if (selectedLayer) {
    selectLayer(selectedLayer.id);

    if (selectedTextId !== null) {
      selectText(selectedTextId);
    }
  } else {
    selectedLayerName.textContent = "レイヤーが選択されていません";
    selectedTextName.textContent = "文章が選択されていません";
    renderLayerList();
    renderTextList();
    renderPreview();
  }

  renderPlaybackFrame();
  updatePlaybackDisplay();
  updateHistoryButtons();
}

function undoEdit() {
  if (!undoStack.length) return;

  redoStack.push(createHistorySnapshot());

  const snapshot = undoStack.pop();
  restoreHistorySnapshot(snapshot);

  showStatus("直前の編集を取り消しました。");
}

function redoEdit() {
  if (!redoStack.length) return;

  undoStack.push(createHistorySnapshot());

  const snapshot = redoStack.pop();
  restoreHistorySnapshot(snapshot);

  showStatus("編集をやり直しました。");
}
function showStatus(message) {
  status.textContent = message;
}
function getSelectedLayer() {
  return layers.find(layer => layer.id === selectedLayerId) || null;
}
function getSelectedText() {
  const layer = getSelectedLayer();
  return layer
    ? layer.texts.find(text => text.id === selectedTextId) || null
    : null;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function normalizeColor(value) {
  const color = String(value || "#FFFFFF").toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : "#FFFFFF";
}
function createLayer(start = 0, end = 2, texts = []) {
  return {
    id: nextLayerId++,
    name: "",
    start,
    end,
    texts
  };
}
function createText(text, x = 50, y = 50, size = 100, color = "#FFFFFF") {
  return {
    id: nextTextId++,
    text,
    x,
    y,
    fontSize: size,
    color: normalizeColor(color)
  };
}
function getCurrentMedia() {
  if (!videoPreview.hidden && videoPreview.src) return videoPreview;
  if (!audioPlayer.hidden && audioPlayer.src) return audioPlayer;
  return null;
}
function getTotalDuration() {
  const media = getCurrentMedia();
  if (media && Number.isFinite(media.duration)) {
    return media.duration;
  }
  return layers.length
    ? Math.max(...layers.map(layer => layer.end))
    : 0;
}
function getPlaybackPosition() {
  const media = getCurrentMedia();
  return media ? media.currentTime || 0 : playbackPosition;
}
function formatSeconds(seconds) {
  return Math.max(0, Number(seconds) || 0).toFixed(1);
}
/* ========================================
   音声・動画の読み込み
======================================== */
function pausePlaybackTimer() {
  if (playbackTimer !== null) {
    clearInterval(playbackTimer);
    playbackTimer = null;
  }
  isPlaying = false;
}
function clearMedia() {
  pausePlaybackTimer();
  videoPreview.pause();
  audioPlayer.pause();
  videoPreview.removeAttribute("src");
  audioPlayer.removeAttribute("src");
  videoPreview.load();
  audioPlayer.load();
  videoPreview.hidden = true;
  audioPlayer.hidden = true;
  if (mediaObjectUrl) {
    URL.revokeObjectURL(mediaObjectUrl);
    mediaObjectUrl = null;
  }
  mediaFileInput.value = "";
  mediaFileName.textContent = "音声・動画は読み込まれていません。";
  playbackPosition = 0;
  renderPreview();
  updatePlaybackDisplay();
  showStatus("音声・動画を解除しました。字幕データは残っています。");
}
function loadMedia(file) {
  if (!file) return;
  const fileName = file.name || "";
  const isVideo =
    file.type.startsWith("video/") ||
    /\.(mp4|webm|mov|m4v)$/i.test(fileName);
  const isAudio =
    file.type.startsWith("audio/") ||
    /\.(mp3|m4a|wav|ogg|aac|flac|mpeg)$/i.test(fileName);
  if (!isVideo && !isAudio) {
    showStatus(
      "対応していないファイルです。MP3などの音声、またはMP4などの動画を選んでください。"
    );
    mediaFileInput.value = "";
    return;
  }
  pausePlaybackTimer();
  videoPreview.pause();
  audioPlayer.pause();
  if (mediaObjectUrl) {
    URL.revokeObjectURL(mediaObjectUrl);
    mediaObjectUrl = null;
  }
  videoPreview.removeAttribute("src");
  audioPlayer.removeAttribute("src");
  videoPreview.hidden = true;
  audioPlayer.hidden = true;
  mediaObjectUrl = URL.createObjectURL(file);
  const player = isVideo ? videoPreview : audioPlayer;
  player.src = mediaObjectUrl;
  player.load();
  if (isVideo) {
    videoPreview.hidden = false;
  } else {
    audioPlayer.hidden = false;
  }
  playbackPosition = 0;
  mediaFileName.textContent = `読み込み中：${fileName}`;
  player.onloadedmetadata = () => {
    if (player !== getCurrentMedia()) return;
    mediaFileName.textContent =
      `${isVideo ? "動画" : "音声"}：${fileName}（${formatSeconds(player.duration)}秒）`;
    playbackPosition = 0;
    renderPlaybackFrame();
    showStatus(
      "メディアを読み込みました。再生ボタンで字幕と同期できます。"
    );
  };
  player.onerror = () => {
    mediaFileName.textContent = `読み込みエラー：${fileName}`;
    showStatus(
      "このファイルを再生できませんでした。別の形式のファイルもお試しください。"
    );
  };
  renderPreview();
  updatePlaybackDisplay();
}
mediaFileInput.addEventListener("change", () => {
  const file = mediaFileInput.files && mediaFileInput.files[0];
  if (file) {
    loadMedia(file);
  }
});
clearMediaButton.addEventListener("click", clearMedia);
/* ========================================
   レイヤー一覧
======================================== */
function renderLayerList() {
  layerList.replaceChildren();
  if (!layers.length) {
  const message = document.createElement("p");
  message.textContent = "まだレイヤーはありません。";
  layerList.appendChild(message);

  updateLayerNavigationButtons();
  return;
}
    layers.forEach((layer, index) => {
      const item = document.createElement("div");
      item.className = "layer-list-item";
            item.dataset.layerId = String(layer.id);
      if (layer.id === selectedLayerId) {
        item.classList.add("selected");
      }
            // ドラッグ用の持ち手
      const dragHandle = document.createElement("span");
      dragHandle.className = "layer-drag-handle";
      dragHandle.textContent = "⠿";
      dragHandle.title = "ここをつかんでレイヤーを並べ替え";
      dragHandle.setAttribute("aria-label", "レイヤーを並べ替え");
      dragHandle.style.touchAction = "none";
      dragHandle.style.cursor = "grab";
      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.textContent =
        `${index + 1}. ${layer.name || `レイヤー${layer.id}`} ` +
        `(${formatSeconds(layer.start)}〜${formatSeconds(layer.end)}秒)`;
      selectButton.style.flex = "1";
      selectButton.style.minWidth = "0";
      selectButton.style.overflowWrap = "anywhere";
      selectButton.addEventListener("click", () => selectLayer(layer.id));
      const duplicateButton = document.createElement("button");
      duplicateButton.type = "button";
      duplicateButton.textContent = "複製";
      duplicateButton.addEventListener("click", () => duplicateLayer(layer.id));
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "削除";
      deleteButton.className = "danger-button";
      deleteButton.addEventListener("click", () => deleteLayer(layer.id));
            item.append(dragHandle, selectButton, duplicateButton, deleteButton);
      enableLayerReordering(item, dragHandle);
      layerList.appendChild(item);
    });
  
  updateLayerNavigationButtons();
}

function enableLayerReordering(item, dragHandle) {
  let isDragging = false;
  let pointerId = null;
  let startY = 0;
  let lastY = 0;
  let originalTop = 0;
  let originalLeft = 0;
  let originalWidth = 0;
  let originalHeight = 0;
  let placeholder = null;
  let startOrder = [];
  let autoScrollFrame = null;

  dragHandle.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();

    isDragging = true;
    pointerId = event.pointerId;
    startY = event.clientY;
    lastY = event.clientY;

    
    // つかんだレイヤーを選択する
    // 一覧そのものは再描画せず、ドラッグ中の要素を維持する
    const layerId = Number(item.dataset.layerId);
    const layer = layers.find(
      entry => Number(entry.id) === layerId
    );

    if (layer && layer.id !== selectedLayerId) {
      selectedLayerId = layer.id;
      selectedTextId = null;

      startTime.value = layer.start;
      endTime.value = layer.end;

      selectedLayerName.textContent =
        `${layer.name || `レイヤー${layer.id}`} を編集中`;
      selectedTextName.textContent = "文章が選択されていません";

      positionX.value = 50;
      positionY.value = 50;
      fontSize.value = 100;
      fontColor.value = "#ffffff";
      fontColorValue.textContent = "#FFFFFF";

      layerList.querySelectorAll(".layer-list-item").forEach(row => {
        row.classList.toggle(
          "selected",
          Number(row.dataset.layerId) === layerId
        );
      });

      renderTextList();
      renderPreview();

      showStatus(`${layer.name || `レイヤー${layer.id}`}を選択しました。`);
    }

    startOrder = Array.from(
      layerList.querySelectorAll(".layer-list-item")
    );


    const rect = item.getBoundingClientRect();
    originalTop = rect.top;
    originalLeft = rect.left;
    originalWidth = rect.width;
    originalHeight = rect.height;

    // 元の位置を確保する空き枠
    placeholder = document.createElement("div");
    placeholder.className = "layer-list-placeholder";
    placeholder.style.height = `${originalHeight}px`;
    placeholder.style.flexShrink = "0";

    item.parentNode.insertBefore(placeholder, item);

    // レイヤーを浮かせて指に追従させる
    item.style.position = "fixed";
    item.style.left = `${originalLeft}px`;
    item.style.top = `${originalTop}px`;
    item.style.width = `${originalWidth}px`;
    item.style.height = `${originalHeight}px`;
    item.style.zIndex = "1000";
    item.style.pointerEvents = "none";
    item.style.boxSizing = "border-box";

    item.classList.add("dragging");

    item.style.setProperty(
      "background-color",
      "rgba(50, 130, 255, 0.3)",
      "important"
    );
    item.style.setProperty(
      "outline",
      "2px solid rgba(50, 130, 255, 1)",
      "important"
    );
    item.style.setProperty("outline-offset", "-2px", "important");

    dragHandle.style.cursor = "grabbing";

    try {
      dragHandle.setPointerCapture(pointerId);
    } catch (error) {
      // 捕捉に失敗しても処理を続ける
    }

    startAutoScroll();
  });

  function moveItem(clientY) {
    if (!isDragging || !placeholder) return;

    lastY = clientY;
    item.style.top = `${originalTop + clientY - startY}px`;

    const rows = Array.from(
      layerList.querySelectorAll(
        ".layer-list-item:not(.dragging)"
      )
    );

    const before = new Map(
      rows.map(row => [row, row.getBoundingClientRect().top])
    );

    let insertBeforeRow = null;

    for (const row of rows) {
      const rect = row.getBoundingClientRect();

      if (clientY < rect.top + rect.height / 2) {
        insertBeforeRow = row;
        break;
      }
    }

    if (insertBeforeRow) {
      if (placeholder.nextElementSibling !== insertBeforeRow) {
        layerList.insertBefore(placeholder, insertBeforeRow);
      }
    } else if (placeholder !== layerList.lastElementChild) {
      layerList.appendChild(placeholder);
    }

    rows.forEach(row => {
      const oldTop = before.get(row);
      const newTop = row.getBoundingClientRect().top;
      const delta = oldTop - newTop;

      if (Math.abs(delta) < 1) return;

      row.style.transition = "none";
      row.style.transform = `translateY(${delta}px)`;
      row.getBoundingClientRect();

      row.style.transition = "transform 180ms ease-out";
      row.style.transform = "translateY(0)";
    });
  }

  function startAutoScroll() {
    stopAutoScroll();

    function tick() {
      if (!isDragging) {
        autoScrollFrame = null;
        return;
      }

      const rect = layerList.getBoundingClientRect();
      const edgeSize = Math.min(55, rect.height / 3);
      const maxSpeed = 12;
      let scrollAmount = 0;

      if (lastY < rect.top + edgeSize && lastY >= rect.top) {
        const ratio = (rect.top + edgeSize - lastY) / edgeSize;
        scrollAmount = -Math.max(2, ratio * maxSpeed);
      } else if (
        lastY > rect.bottom - edgeSize &&
        lastY <= rect.bottom
      ) {
        const ratio = (lastY - (rect.bottom - edgeSize)) / edgeSize;
        scrollAmount = Math.max(2, ratio * maxSpeed);
      }

      if (scrollAmount !== 0) {
        const oldScrollTop = layerList.scrollTop;
        layerList.scrollTop += scrollAmount;

        if (layerList.scrollTop !== oldScrollTop) {
          moveItem(lastY);
        }
      }

      autoScrollFrame = requestAnimationFrame(tick);
    }

    autoScrollFrame = requestAnimationFrame(tick);
  }

  function stopAutoScroll() {
    if (autoScrollFrame !== null) {
      cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    }
  }

  dragHandle.addEventListener("pointermove", event => {
    if (!isDragging || event.pointerId !== pointerId) return;

    event.preventDefault();
    moveItem(event.clientY);
  });

  function finishReordering(event) {
    if (!isDragging) return;
    if (event && event.pointerId !== pointerId) return;

    isDragging = false;
    stopAutoScroll();
    pointerId = null;

    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(item, placeholder);
      placeholder.remove();
    }

    item.style.removeProperty("position");
    item.style.removeProperty("left");
    item.style.removeProperty("top");
    item.style.removeProperty("width");
    item.style.removeProperty("height");
    item.style.removeProperty("z-index");
    item.style.removeProperty("pointer-events");
    item.style.removeProperty("box-sizing");
    item.style.removeProperty("transform");
    item.style.removeProperty("background-color");
    item.style.removeProperty("outline");
    item.style.removeProperty("outline-offset");
    item.classList.remove("dragging");
    dragHandle.style.cursor = "grab";

    layerList.querySelectorAll(".layer-list-item").forEach(row => {
      row.style.removeProperty("transition");
      row.style.removeProperty("transform");
    });

    const newIds = Array.from(
      layerList.querySelectorAll(".layer-list-item")
    ).map(row => Number(row.dataset.layerId));

    const oldIds = startOrder.map(
      row => Number(row.dataset.layerId)
    );

    const changed = newIds.some(
      (id, index) => id !== oldIds[index]
    );

    placeholder = null;

    
    if (changed) {
      const movedLayerId = Number(item.dataset.layerId);

      recordHistory();

      const layersById = new Map(
        layers.map(layer => [Number(layer.id), layer])
      );

      const movedLayer = layersById.get(movedLayerId);

      const duration = movedLayer
        ? movedLayer.end - movedLayer.start
        : 0;

      layers = newIds
        .map(id => layersById.get(id))
        .filter(Boolean);

      const movedIndex = layers.findIndex(
        layer => Number(layer.id) === movedLayerId
      );

      if (movedLayer && movedIndex !== -1) {
        const newStart = movedIndex === 0
          ? 0
          : layers[movedIndex - 1].start;

        movedLayer.start = newStart;
        movedLayer.end = newStart + duration;

        if (selectedLayerId === movedLayerId) {
          startTime.value = movedLayer.start;
          endTime.value = movedLayer.end;
        }
      }

      renderLayerList();
      updateLayerNavigationButtons();
      renderPlaybackFrame();

      showStatus("レイヤーの順番を変更しました。");
    } else {
      renderLayerList();
    }

  }

  dragHandle.addEventListener("pointerup", finishReordering);
  dragHandle.addEventListener("pointercancel", finishReordering);
  dragHandle.addEventListener("lostpointercapture", finishReordering);
}
// レイヤー一覧の時間順で、前後のレイヤーへ切り替える
function navigateLayer(direction) {
  const sortedLayers = [...layers].sort(
    (a, b) => a.start - b.start || a.id - b.id
  );

  const currentIndex = sortedLayers.findIndex(
    layer => layer.id === selectedLayerId
  );

  if (currentIndex === -1) return;

  const nextIndex = currentIndex + direction;

  if (nextIndex < 0 || nextIndex >= sortedLayers.length) {
    return;
  }

  selectLayer(sortedLayers[nextIndex].id);
}

// 現在の選択位置に合わせてボタンを有効・無効にする
function updateLayerNavigationButtons() {
  const previousButton = document.getElementById("previousLayerButton");
  const nextButton = document.getElementById("nextLayerButton");

  const sortedLayers = [...layers].sort(
    (a, b) => a.start - b.start || a.id - b.id
  );

  const currentIndex = sortedLayers.findIndex(
    layer => layer.id === selectedLayerId
  );

  previousButton.disabled =
    currentIndex <= 0;

  nextButton.disabled =
    currentIndex === -1 ||
    currentIndex >= sortedLayers.length - 1;
}
function selectLayer(layerId) {
  const layer = layers.find(item => item.id === layerId);
  if (!layer) return;
  selectedLayerId = layer.id;
  selectedTextId = null;
  startTime.value = layer.start;
  endTime.value = layer.end;
  selectedLayerName.textContent =
    `${layer.name || `レイヤー${layer.id}`} を編集中`;
  selectedTextName.textContent = "文章が選択されていません";
  positionX.value = 50;
  positionY.value = 50;
  fontSize.value = 100;
  fontColor.value = "#ffffff";
  fontColorValue.textContent = "#FFFFFF";
  renderLayerList();
  renderTextList();
  renderPreview();
  showStatus(`${layer.name || `レイヤー${layer.id}`}を選択しました。`);
}
function addLayer() {
  const latestEnd = layers.length
    ? Math.max(...layers.map(layer => layer.end))
    : 0;
  const layer = createLayer(latestEnd, latestEnd + 2);
  recordHistory();
  layer.name = `レイヤー${layer.id}`;
  layers.push(layer);
  selectLayer(layer.id);
  showStatus(`${layer.name}を追加しました。`);
}
function duplicateLayer(layerId) {
  const original = layers.find(layer => layer.id === layerId);
  if (!original) return;
  recordHistory();
  const duration = original.end - original.start;
  const start = layers.length
    ? Math.max(...layers.map(layer => layer.end))
    : 0;
  const copiedTexts = original.texts.map(text =>
    createText(text.text, text.x, text.y, text.fontSize, text.color)
  );
  const newLayer = createLayer(start, start + duration, copiedTexts);
  newLayer.name = `レイヤー${newLayer.id}`;
  layers.push(newLayer);
  selectLayer(newLayer.id);
  showStatus(`${original.name || "レイヤー"}を複製しました。`);
}
function deleteLayer(layerId) {
  const layer = layers.find(item => item.id === layerId);
  if (!layer) return;
  if (!confirm(
    `${layer.name || `レイヤー${layer.id}`}を削除しますか？\n中の文章もすべて削除されます。`
  )) return;
  recordHistory();
  layers = layers.filter(item => item.id !== layerId);
  if (selectedLayerId === layerId) {
    selectedLayerId = null;
    selectedTextId = null;
    if (layers.length) {
      selectLayer([...layers].sort((a, b) => a.start - b.start)[0].id);
    } else {
      selectedLayerName.textContent = "レイヤーが選択されていません";
      selectedTextName.textContent = "文章が選択されていません";
      renderLayerList();
      renderTextList();
      renderPreview();
    }
  } else {
    renderLayerList();
  }
  updatePlaybackDisplay();
  showStatus("レイヤーを削除しました。");
}

function applyLayerTime() {
  const layer = getSelectedLayer();

  if (!layer) {
    showStatus("先にレイヤーを選択してください。");
    return;
  }

  const start = Number(startTime.value);
  const end = Number(endTime.value);

  if (
    startTime.value.trim() === "" ||
    endTime.value.trim() === "" ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start
  ) {
    showStatus("開始時間と終了時間を正しく入力してください。");
    return;
  }

  recordHistory();

  layer.start = start;
  layer.end = end;

  // 表示時間を反映したときだけ、開始時間の早い順に並べ替える
  layers.sort(
    (a, b) => a.start - b.start || a.id - b.id
  );

  renderLayerList();
  updateLayerNavigationButtons();
  renderPlaybackFrame();

  showStatus("レイヤーの表示時間を反映し、時間順に並べ替えました。");
}

/* ========================================
   文章の追加・複製・削除
======================================== */
function addText() {
  const layer = getSelectedLayer();
  if (!layer) {
    showStatus("先にレイヤーを追加または選択してください。");
    return;
  }
  const value = textInput.value.trim();
  if (!value) {
    showStatus("文章を入力してください。");
    return;
  }
  const text = createText(value);
  layer.texts.push(text);
  selectedTextId = text.id;
  textInput.value = "";
  renderTextList();
  renderPreview();
  updateSelectedTextControls();
  showStatus("文章を追加しました。");
}
function duplicateText(textId) {
  const layer = getSelectedLayer();
  if (!layer) return;
  const original = layer.texts.find(text => text.id === textId);
  if (!original) return;
  const copied = createText(
    original.text,
    clamp(original.x + 3, 0, 100),
    clamp(original.y + 3, 0, 100),
    original.fontSize,
    original.color
  );
  layer.texts.push(copied);
  selectedTextId = copied.id;
  renderTextList();
  renderPreview();
  updateSelectedTextControls();
  showStatus("文章を複製しました。");
}
function deleteSelectedText() {
  const layer = getSelectedLayer();
  if (!layer || selectedTextId === null) {
    showStatus("削除する文章を選択してください。");
    return;
  }
  layer.texts = layer.texts.filter(text => text.id !== selectedTextId);
  selectedTextId = null;
  renderTextList();
  renderPreview();
  updateSelectedTextControls();
  showStatus("文章を削除しました。");
}

function renderTextList() {
  textList.replaceChildren();

  const layer = getSelectedLayer();

  if (!layer) {
    const message = document.createElement("p");
    message.textContent = "レイヤーを選択してください。";
    textList.appendChild(message);
    return;
  }

  if (!layer.texts.length) {
    const message = document.createElement("p");
    message.textContent = "このレイヤーにはまだ文章がありません。";
    textList.appendChild(message);
    return;
  }

  layer.texts.forEach((text, index) => {
    const item = document.createElement("div");
    item.className = "text-list-item";
    item.dataset.textId = String(text.id);

    if (text.id === selectedTextId) {
      item.classList.add("selected");
    }

    // ドラッグ用の目印
    const dragHandle = document.createElement("span");
    dragHandle.className = "text-drag-handle";
    dragHandle.textContent = "⠿";
    dragHandle.title = "ここをつかんで字幕を並べ替え";
    dragHandle.setAttribute("aria-label", "字幕を並べ替え");
    dragHandle.style.touchAction = "none";
dragHandle.style.cursor = "grab";

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.textContent =
      `${index + 1}. ${text.text.replace(/\s+/g, " ")}`;
    selectButton.style.width = "100%";
selectButton.style.minWidth = "0";
selectButton.style.flex = "1";
selectButton.style.textAlign = "left";
selectButton.style.whiteSpace = "nowrap";
selectButton.style.overflow = "hidden";
selectButton.style.textOverflow = "ellipsis";
    selectButton.addEventListener("click", () => selectText(text.id));

    const duplicateButton = document.createElement("button");
    duplicateButton.type = "button";
    duplicateButton.textContent = "複製";
    duplicateButton.addEventListener("click", () => duplicateText(text.id));

    item.append(dragHandle, selectButton, duplicateButton);
    enableTextReordering(item, dragHandle, layer);
    textList.appendChild(item);
  });
}



function enableTextReordering(item, dragHandle, layer) {
  let isDragging = false;
  let startOrder = [];
  let pointerId = null;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let placeholder = null;
  let originalHeight = 0;
  let originalWidth = 0;
  let originalLeft = 0;
  let originalTop = 0;
  let autoScrollFrame = null;

  dragHandle.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    event.preventDefault();

    isDragging = true;
    pointerId = event.pointerId;
    startY = event.clientY;
    lastX = event.clientX;
    lastY = event.clientY;

    // つかんだ字幕を選択する。リストは再描画しない
    selectText(Number(item.dataset.textId), {
      skipListRender: true
    });

    startOrder = Array.from(
      textList.querySelectorAll(".text-list-item")
    );

    const rect = item.getBoundingClientRect();
    originalHeight = rect.height;
    originalWidth = rect.width;
    originalLeft = rect.left;
    originalTop = rect.top;

    // 元の場所を確保する空き枠
    placeholder = document.createElement("div");
    placeholder.className = "text-list-placeholder";
    placeholder.style.height = `${originalHeight}px`;
    placeholder.style.flexShrink = "0";

    item.parentNode.insertBefore(placeholder, item);

    // 字幕をリストから浮かせて指に追従させる
    item.style.position = "fixed";
    item.style.left = `${originalLeft}px`;
    item.style.top = `${originalTop}px`;
    item.style.width = `${originalWidth}px`;
    item.style.height = `${originalHeight}px`;
    item.style.zIndex = "1000";
    item.style.pointerEvents = "none";
    item.style.boxSizing = "border-box";
    item.style.transform = "translateY(0)";

    item.classList.add("dragging");

    item.style.setProperty(
      "background-color",
      "rgba(50, 130, 255, 0.3)",
      "important"
    );
    item.style.setProperty(
      "outline",
      "2px solid rgba(50, 130, 255, 1)",
      "important"
    );
    item.style.setProperty("outline-offset", "-2px", "important");

    dragHandle.style.cursor = "grabbing";

    try {
      dragHandle.setPointerCapture(pointerId);
    } catch (error) {
      // 捕捉に失敗しても処理を続ける
    }

    startAutoScroll();
  });

  function moveItem(clientX, clientY) {
    if (!isDragging || !placeholder) return;

    lastX = clientX;
    lastY = clientY;

    const currentY = clientY - startY;
    item.style.top = `${originalTop + currentY}px`;

    const rows = Array.from(
      textList.querySelectorAll(".text-list-item:not(.dragging)")
    );

    let insertBeforeRow = null;

    for (const row of rows) {
      const rect = row.getBoundingClientRect();

      if (clientY < rect.top + rect.height / 2) {
        insertBeforeRow = row;
        break;
      }
    }

    const before = new Map(
      rows.map(row => [row, row.getBoundingClientRect().top])
    );

    if (insertBeforeRow) {
      if (placeholder.nextElementSibling !== insertBeforeRow) {
        textList.insertBefore(placeholder, insertBeforeRow);
      }
    } else if (placeholder !== textList.lastElementChild) {
      textList.appendChild(placeholder);
    }

    rows.forEach(row => {
      const oldTop = before.get(row);
      const newTop = row.getBoundingClientRect().top;
      const delta = oldTop - newTop;

      if (Math.abs(delta) < 1) return;

      row.style.transition = "none";
      row.style.transform = `translateY(${delta}px)`;
      row.getBoundingClientRect();

      row.style.transition = "transform 180ms ease-out";
      row.style.transform = "translateY(0)";
    });
  }

  function startAutoScroll() {
    stopAutoScroll();

    function tick() {
      if (!isDragging) {
        autoScrollFrame = null;
        return;
      }

      const rect = textList.getBoundingClientRect();

      // 上下端に近づくほど自動スクロールする
      const edgeSize = Math.min(55, rect.height / 3);
      const maxSpeed = 12;
      let scrollAmount = 0;

      if (lastY < rect.top + edgeSize && lastY >= rect.top) {
        const ratio = (rect.top + edgeSize - lastY) / edgeSize;
        scrollAmount = -Math.max(2, ratio * maxSpeed);
      } else if (
        lastY > rect.bottom - edgeSize &&
        lastY <= rect.bottom
      ) {
        const ratio = (lastY - (rect.bottom - edgeSize)) / edgeSize;
        scrollAmount = Math.max(2, ratio * maxSpeed);
      }

      if (scrollAmount !== 0) {
        const oldScrollTop = textList.scrollTop;

        textList.scrollTop += scrollAmount;

        // 実際にスクロールできた場合、並べ替え位置を更新
        if (textList.scrollTop !== oldScrollTop) {
          moveItem(lastX, lastY);
        }
      }

      autoScrollFrame = requestAnimationFrame(tick);
    }

    autoScrollFrame = requestAnimationFrame(tick);
  }

  function stopAutoScroll() {
    if (autoScrollFrame !== null) {
      cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    }
  }

  dragHandle.addEventListener("pointermove", event => {
    if (!isDragging || event.pointerId !== pointerId) return;

    event.preventDefault();
    moveItem(event.clientX, event.clientY);
  });

  function finishReordering(event) {
    if (!isDragging) return;
    if (event && event.pointerId !== pointerId) return;

    isDragging = false;
    stopAutoScroll();
    pointerId = null;

    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(item, placeholder);
      placeholder.remove();
    }

    // ドラッグ用の設定を解除
    item.style.removeProperty("position");
    item.style.removeProperty("left");
    item.style.removeProperty("top");
    item.style.removeProperty("width");
    item.style.removeProperty("height");
    item.style.removeProperty("z-index");
    item.style.removeProperty("pointer-events");
    item.style.removeProperty("box-sizing");
    item.style.removeProperty("transform");
    item.style.removeProperty("background-color");
    item.style.removeProperty("outline");
    item.style.removeProperty("outline-offset");
    item.classList.remove("dragging");
    dragHandle.style.cursor = "grab";

    textList.querySelectorAll(".text-list-item").forEach(row => {
      row.style.removeProperty("transition");
      row.style.removeProperty("transform");
    });

    const newIds = Array.from(
      textList.querySelectorAll(".text-list-item")
    ).map(row => Number(row.dataset.textId));

    const oldIds = startOrder.map(
      row => Number(row.dataset.textId)
    );

    const changed = newIds.some(
      (id, index) => id !== oldIds[index]
    );

    placeholder = null;

    if (changed) {
      recordHistory();

      const textsById = new Map(
        layer.texts.map(text => [Number(text.id), text])
      );

      layer.texts = newIds
        .map(id => textsById.get(id))
        .filter(Boolean);
    }

    renderTextList();

    if (isPlaying) {
      renderPlaybackFrame();
    } else {
      renderPreview();
    }
  }

  dragHandle.addEventListener("pointerup", finishReordering);
  dragHandle.addEventListener("pointercancel", finishReordering);
  dragHandle.addEventListener("lostpointercapture", finishReordering);
}



/* ========================================
   文章の選択と設定
======================================== */

function selectText(textId, options = {}) {
  const layer = getSelectedLayer();
  if (!layer) return;

  const text = layer.texts.find(
    item => Number(item.id) === Number(textId)
  );
  if (!text) return;

  selectedTextId = text.id;
  updateSelectedTextControls();

  // 通常の選択時だけ一覧を再描画する
  if (!options.skipListRender) {
    renderTextList();
  } else {
    // スクロール中は既存の行の選択表示だけを更新
    textList.querySelectorAll(".text-list-item").forEach(row => {
      row.classList.toggle(
        "selected",
        Number(row.dataset.textId) === Number(text.id)
      );
    });
  }

  // プレビュー側の字幕も選択状態にする
  preview.querySelectorAll(".draggable-text").forEach(element => {
    element.classList.toggle(
      "selected",
      Number(element.dataset.textId) === Number(text.id) &&
      Number(element.dataset.layerId) === Number(layer.id)
    );
  });
}




function updateSelectedTextControls() {
  const text = getSelectedText();
  if (!text) {
    selectedTextName.textContent = "文章が選択されていません";
    return;
  }
  text.color = normalizeColor(text.color);
  selectedTextName.textContent = text.text;
  positionX.value = text.x;
  positionY.value = text.y;
  fontSize.value = text.fontSize;
  fontColor.value = text.color.toLowerCase();
  fontColorValue.textContent = text.color;
}
function applyPosition() {
  const text = getSelectedText();
  if (!text) {
    showStatus("位置を変更する文章を選択してください。");
    return;
  }
  const x = Number(positionX.value);
  const y = Number(positionY.value);
  if (
    positionX.value.trim() === "" ||
    positionY.value.trim() === "" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    showStatus("横位置と縦位置を数値で入力してください。");
    return;
  }
  text.x = clamp(x, 0, 100);
  text.y = clamp(y, 0, 100);
  renderPreview();
  showStatus("文章の位置を反映しました。");
}
function applyFontSize() {
  const text = getSelectedText();
  if (!text) {
    showStatus("設定を変更する文章を選択してください。");
    return;
  }
  const size = Number(fontSize.value);
  if (fontSize.value.trim() === "" || !Number.isFinite(size)) {
    showStatus("文字サイズを数値で入力してください。");
    return;
  }
  text.fontSize = clamp(size, 25, 300);
  text.color = normalizeColor(fontColor.value);
  renderPreview();
  updateSelectedTextControls();
  showStatus("文字サイズと文字色を反映しました。");
}
fontColor.addEventListener("input", () => {
  fontColorValue.textContent = normalizeColor(fontColor.value);
});
/* ========================================
   プレビュー描画
======================================== */
function renderPreview(visibleLayers = null) {
  if (visibleLayers === null) {
    lastPlaybackLayerKey = null;
  } else {
    lastPlaybackLayerKey = visibleLayers
      .map(layer => layer.id)
      .join(",");
  }

  preview.querySelectorAll(".draggable-text").forEach(element => {
    element.remove();
  });
  let layersToShow;
  if (visibleLayers !== null) {
    layersToShow = visibleLayers;
  } else {
    const layer = getSelectedLayer();
    layersToShow = layer ? [layer] : [];
  }
  let textCount = 0;
  layersToShow.forEach(layer => {
    layer.texts.forEach(text => {
      textCount++;
      const element = document.createElement("div");
      element.className = "draggable-text";
      element.textContent = text.text;
      element.dataset.textId = String(text.id);
      element.dataset.layerId = String(layer.id);
      element.style.left = `${text.x}%`;
      element.style.top = `${text.y}%`;
      element.style.fontSize = `${16 * text.fontSize / 100}px`;
      element.style.color = normalizeColor(text.color);
      if (
        layer.id === selectedLayerId &&
        text.id === selectedTextId
      ) {
        element.classList.add("selected");
      }
      element.addEventListener("click", () => {
        if (!isPlaying) {
          if (layer.id !== selectedLayerId) selectLayer(layer.id);
          selectText(text.id);
        }
      });
      enableDragging(element, layer, text);
      preview.appendChild(element);
    });
  });
  previewGuide.style.display = textCount === 0 ? "block" : "none";
  previewGuide.textContent = getCurrentMedia()
    ? "字幕が表示される時間になると、ここに表示されます"
    : "字幕の配置プレビュー";
}
function enableDragging(element, layer, text) {
  let dragging = false;
  let pointerId = null;
  let startPointerX = 0;
  let startPointerY = 0;
  let startTextX = 0;
  let startTextY = 0;
  element.addEventListener("pointerdown", event => {
    if (isPlaying) return;
    event.preventDefault();
    if (layer.id !== selectedLayerId) {
      selectLayer(layer.id);
      return;
    }
    selectText(text.id);
    dragging = true;
    pointerId = event.pointerId;
    startPointerX = event.clientX;
    startPointerY = event.clientY;
    startTextX = text.x;
    startTextY = text.y;
    if (element.setPointerCapture) {
      element.setPointerCapture(pointerId);
    }
  });
  element.addEventListener("pointermove", event => {
    if (!dragging || event.pointerId !== pointerId) return;
    event.preventDefault();
    const rect = preview.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    text.x = clamp(
      startTextX + ((event.clientX - startPointerX) / rect.width) * 100,
      0, 100
    );
    text.y = clamp(
      startTextY + ((event.clientY - startPointerY) / rect.height) * 100,
      0, 100
    );
    element.style.left = `${text.x}%`;
    element.style.top = `${text.y}%`;
    positionX.value = text.x.toFixed(1);
    positionY.value = text.y.toFixed(1);
  });
  function finishDragging(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    text.x = Math.round(text.x * 10) / 10;
    text.y = Math.round(text.y * 10) / 10;
    element.style.left = `${text.x}%`;
    element.style.top = `${text.y}%`;
    positionX.value = text.x.toFixed(1);
    positionY.value = text.y.toFixed(1);
    renderTextList();
    updateSelectedTextControls();
  }
  element.addEventListener("pointerup", finishDragging);
  element.addEventListener("pointercancel", finishDragging);
  element.addEventListener("lostpointercapture", () => {
    dragging = false;
    pointerId = null;
  });
}
/* ========================================
   再生と字幕同期
======================================== */
function getActiveLayers(time) {
  return layers.filter(layer => time >= layer.start && time < layer.end);
}
function updatePlaybackDisplay() {
  const duration = getTotalDuration();
  const position = getPlaybackPosition();
  playbackTime.textContent =
    `${formatSeconds(position)}秒 / ${formatSeconds(duration)}秒`;
  playbackProgress.min = 0;
  playbackProgress.max = duration > 0 ? duration : 1;
  playbackProgress.step = 0.1;
  playbackProgress.value = Math.min(position, duration);
}
function renderPlaybackFrame() {
  playbackPosition = getPlaybackPosition();

  const activeLayers = getActiveLayers(playbackPosition);
  const layerKey = activeLayers
    .map(layer => layer.id)
    .join(",");

  if (layerKey !== lastPlaybackLayerKey) {
    renderPreview(activeLayers);
  }

  updatePlaybackDisplay();
}
function seekPlayback(value) {
  const media = getCurrentMedia();
  const duration = getTotalDuration();
  const time = clamp(Number(value) || 0, 0, duration);
  if (media) {
    if (!Number.isFinite(media.duration)) return;
    try {
      media.currentTime = time;
    } catch (error) {
      showStatus("再生位置を変更できませんでした。");
      return;
    }
  } else {
    playbackPosition = time;
    if (isPlaying) {
      playbackStartedAt = performance.now() - time * 1000;
    }
  }
  playbackPosition = time;
  renderPlaybackFrame();
}
function startPlaybackTimer() {
  if (playbackTimer !== null) {
    clearInterval(playbackTimer);
  }
  playbackTimer = setInterval(() => {
    const media = getCurrentMedia();
    if (media) {
      playbackPosition = media.currentTime || 0;
    } else {
      playbackPosition = (performance.now() - playbackStartedAt) / 1000;
      if (playbackPosition >= getTotalDuration()) {
        playbackPosition = getTotalDuration();
        stopPreview(false);
        return;
      }
    }
    renderPlaybackFrame();
  }, 40);
}

async function playPreview() {
  const media = getCurrentMedia();

  // 再生中なら、一時停止する
  if (isPlaying) {
    if (media) {
      media.pause();
    } else {
      pausePlaybackTimer();
      playbackPosition = getPlaybackPosition();
      renderPlaybackFrame();
    }

    playButton.textContent = "▶️";
    playButton.setAttribute("aria-label", "再生");
    showStatus("一時停止しました。続きから再生できます。");
    return;
  }

  // メディアがある場合
  if (media) {
    if (
      Number.isFinite(media.duration) &&
      media.currentTime >= media.duration
    ) {
      media.currentTime = 0;
    }

    try {
      await media.play();
      isPlaying = true;
      playButton.textContent = "⏸️";
      playButton.setAttribute("aria-label", "一時停止");
      showStatus("音声・動画に合わせて字幕を再生中です。");
      startPlaybackTimer();
    } catch (error) {
      showStatus("再生できませんでした。ファイル形式を確認してください。");
    }

    return;
  }

  // 音声・動画がなく、字幕だけを再生する場合
  const duration = getTotalDuration();

  if (duration <= 0) {
    showStatus("再生するレイヤーを追加してください。");
    return;
  }

  if (playbackPosition >= duration) {
    playbackPosition = 0;
  }

  isPlaying = true;
  playbackStartedAt = performance.now() - playbackPosition * 1000;

  playButton.textContent = "⏸️";
  playButton.setAttribute("aria-label", "一時停止");

  showStatus("字幕プレビューを再生中です。");
  startPlaybackTimer();
}


function stopPreview(reset = true) {
  const media = getCurrentMedia();

  // 先にタイマーと再生状態を停止する
  pausePlaybackTimer();

  // 再生位置を決めてから、メディアを停止する
  if (reset) {
    playbackPosition = 0;
  } else if (media) {
    playbackPosition = media.currentTime || 0;
  }

  if (media) {
    try {
      if (reset && media.readyState > 0) {
        media.currentTime = 0;
      }
    } catch (error) {
      // メディアの読み込み状態によっては位置を変更できない場合がある
    }

    media.pause();
  }

  // 停止後の字幕表示と時間表示を更新する
  renderPreview(getActiveLayers(playbackPosition));
  updatePlaybackDisplay();

  playButton.textContent = "▶️";
  playButton.setAttribute("aria-label", "再生");

  showStatus(
    reset ? "プレビューを停止しました。" : "再生が終了しました。"
  );
}

function handleMediaTimeUpdate() {
  if (!isPlaying) {
    playbackPosition = getPlaybackPosition();
  }
  renderPlaybackFrame();
}
[videoPreview, audioPlayer].forEach(player => {
  player.addEventListener("timeupdate", handleMediaTimeUpdate);
  player.addEventListener("seeked", handleMediaTimeUpdate);
  player.addEventListener("play", () => {
    if (player === getCurrentMedia()) {
      isPlaying = true;
      startPlaybackTimer();
    }
  });
  player.addEventListener("pause", () => {
    if (player === getCurrentMedia()) {
      pausePlaybackTimer();
      playbackPosition = player.currentTime || 0;
      renderPlaybackFrame();
    }
  });
  player.addEventListener("ended", () => {
    if (player === getCurrentMedia()) {
      pausePlaybackTimer();
      playbackPosition = player.duration || 0;
      renderPlaybackFrame();
      showStatus("再生が終了しました。");
    }
  });
  player.addEventListener("loadedmetadata", () => {
    if (player === getCurrentMedia()) {
      updatePlaybackDisplay();
    }
  });
});
/* ========================================
   ファイルのダウンロード
======================================== */
function safeFilename(extension) {
  let name = exportFileName.value.trim() || "字幕";
  name = name.replace(/\.(vtt|ytt|xml)$/i, "");
  name = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  if (!name) name = "字幕";
  return `${name}.${extension}`;
}

async function downloadTextFile(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });

  // 保存先選択に対応しているブラウザでは、保存先を選べるようにする
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: "字幕ファイル",
          accept: {
            [mimeType.split(";")[0]]: [
              "." + filename.split(".").pop()
            ]
          }
        }]
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      showStatus(`${filename}を保存しました。`);
      return;
    } catch (error) {
      if (error.name === "AbortError") {
        showStatus("保存をキャンセルしました。");
        return;
      }

      showStatus("保存先を選べなかったため、通常のダウンロードを試します。");
    }
  }

  // 非対応ブラウザ向けの通常ダウンロード
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
/* ========================================
   JSON保存・読み込み
======================================== */
function saveProject() {
  const project = {
    app: "すなけ字幕変換ツール MK.IV",
    version: 4,
    layers,
    nextLayerId,
    nextTextId
  };
  downloadTextFile(
    JSON.stringify(project, null, 2),
    "application/json;charset=utf-8",
    "字幕テキスト配置メーカー.json"
  );
  showStatus("作品をJSONファイルに保存しました。");
}
function loadProjectFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const project = JSON.parse(reader.result);
      let importedLayers = [];
      if (Array.isArray(project.layers)) {
        importedLayers = project.layers;
      } else if (Array.isArray(project.texts)) {
        importedLayers = project.texts.map((text, index) => {
          const startValue = Number(text.start);
          const start = Number.isFinite(startValue) ? startValue : 0;
          const endValue = Number(text.end);
          const end =
            Number.isFinite(endValue) && endValue > start
              ? endValue
              : start + 2;
          return {
            id: index + 1,
            name: `レイヤー${index + 1}`,
            start,
            end,
            texts: [{
              id: index + 1,
              text: String(text.text ?? ""),
              x: clamp(Number(text.x) || 50, 0, 100),
              y: clamp(Number(text.y) || 50, 0, 100),
              fontSize: clamp(Number(text.fontSize) || 100, 25, 300),
              color: normalizeColor(text.color)
            }]
          };
        });
      } else {
        throw new Error("対応していない保存データです。");
      }
      layers = importedLayers.map((layer, index) => {
        const start = Number(layer.start);
        const end = Number(layer.end);
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < 0 ||
          end <= start ||
          !Array.isArray(layer.texts)
        ) {
          throw new Error("レイヤーの時間または文章データが不正です。");
        }
        const texts = layer.texts.map(text => {
          const x = Number(text.x);
          const y = Number(text.y);
          const size = Number(text.fontSize);
          return {
            id: Number(text.id) || 0,
            text: String(text.text ?? ""),
            x: clamp(Number.isFinite(x) ? x : 50, 0, 100),
            y: clamp(Number.isFinite(y) ? y : 50, 0, 100),
            fontSize: clamp(Number.isFinite(size) ? size : 100, 25, 300),
            color: normalizeColor(text.color)
          };
        });
        return {
          id: Number(layer.id) || index + 1,
          name: String(layer.name || `レイヤー${index + 1}`),
          start,
          end,
          texts
        };
      });
      nextLayerId = Math.max(
        Number(project.nextLayerId) || 1,
        1,
        ...layers.map(layer => layer.id + 1)
      );
      const allTextIds = layers.flatMap(layer =>
        layer.texts.map(text => text.id)
      );
      nextTextId = Math.max(
        Number(project.nextTextId) || 1,
        1,
        ...allTextIds.map(id => id + 1)
      );
      selectedLayerId = null;
      selectedTextId = null;
      playbackPosition = 0;
      if (layers.length) {
        selectLayer(
          [...layers].sort((a, b) => a.start - b.start)[0].id
        );
      } else {
        renderLayerList();
        renderTextList();
        renderPreview();
      }
      updatePlaybackDisplay();
      showStatus("作品を読み込みました。");
    } catch (error) {
      showStatus(`読み込みに失敗しました：${error.message}`);
    }
  };
  reader.onerror = () => {
    showStatus("ファイルを読み込めませんでした。");
  };
  reader.readAsText(file);
}
/* ========================================
   WebVTT書き出し
======================================== */
function secondsToVttTime(seconds) {
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return (
    `${String(hours).padStart(2, "0")}:` +
    `${String(minutes).padStart(2, "0")}:` +
    `${String(wholeSeconds).padStart(2, "0")}.` +
    `${String(milliseconds).padStart(3, "0")}`
  );
}
function exportVtt() {
  if (!layers.length) {
    showStatus("書き出すレイヤーがありません。");
    return;
  }
  const cues = [];
  [...layers]
    .sort((a, b) => a.start - b.start || a.id - b.id)
    .forEach(layer => {
      layer.texts.forEach(text => {
        const safeText = text.text.replace(/-->/g, "—>");
        const x = clamp(Number(text.x), 0, 100).toFixed(1);
        const y = clamp(Number(text.y), 0, 100).toFixed(1);
        cues.push(
          `${secondsToVttTime(layer.start)} --> ` +
          `${secondsToVttTime(layer.end)} ` +
          `line:${y}% position:${x}% align:center size:50%\n` +
          safeText
        );
      });
    });
  if (!cues.length) {
    showStatus("書き出す文章がありません。");
    return;
  }
  const content = "WEBVTT\n\n" + cues.join("\n\n") + "\n";
  downloadTextFile(
    content,
    "text/vtt;charset=utf-8",
    safeFilename("vtt")
  );
  showStatus("WebVTTファイルを書き出しました。");
}
/* ========================================
   YTT書き出し
======================================== */
function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function secondsToMilliseconds(seconds) {
  return Math.max(0, Math.round(Number(seconds) * 1000));
}
function exportYtt() {
  if (!layers.length) {
    showStatus("書き出すレイヤーがありません。");
    return;
  }
  const entries = [];
  [...layers]
    .sort((a, b) => a.start - b.start || a.id - b.id)
    .forEach(layer => {
      layer.texts.forEach(text => {
        if (String(text.text ?? "").length === 0) return;
        const startMs = secondsToMilliseconds(layer.start);
        const endMs = secondsToMilliseconds(layer.end);
        if (endMs <= startMs) return;
        entries.push({
          text,
          startMs,
          durationMs: endMs - startMs,
          x: Math.round(clamp(Number(text.x), 0, 100)),
          y: Math.round(clamp(Number(text.y), 0, 100)),
          fontSize: Math.round(
            clamp(Number(text.fontSize) || 100, 25, 300)
          ),
          color: normalizeColor(text.color)
        });
      });
    });
  if (!entries.length) {
    showStatus("YTTに書き出せる文章がありません。");
    return;
  }
  const penIds = new Map();
  const positionIds = new Map();
  entries.forEach(entry => {
    const styleKey = `${entry.color}|${entry.fontSize}`;
    if (!penIds.has(styleKey)) {
      penIds.set(styleKey, penIds.size + 1);
    }
    const positionKey = `${entry.x}|${entry.y}`;
    if (!positionIds.has(positionKey)) {
      positionIds.set(positionKey, positionIds.size + 1);
    }
    entry.penId = penIds.get(styleKey);
    entry.positionId = positionIds.get(positionKey);
  });
  const headLines = [];
  for (const [styleKey, penId] of penIds.entries()) {
    const [color, size] = styleKey.split("|");
    headLines.push(
      `    <pen id="${penId}" fc="${color}" sz="${size}" />`
    );
  }
  for (const [positionKey, positionId] of positionIds.entries()) {
    const [x, y] = positionKey.split("|");
    headLines.push(
      `    <wp id="${positionId}" ap="4" ah="${x}" av="${y}" />`
    );
  }
  const bodyLines = entries.map(entry =>
    `    <p t="${entry.startMs}" d="${entry.durationMs}" ` +
    `wp="${entry.positionId}" p="${entry.penId}">` +
    `${escapeXml(entry.text.text)}</p>`
  );
  const yttContent = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<timedtext format="3">',
    '  <head>',
    ...headLines,
    '  </head>',
    '  <body>',
    ...bodyLines,
    '  </body>',
    '</timedtext>',
    ''
  ].join("\n");
  downloadTextFile(
    yttContent,
    "application/xml;charset=utf-8",
    safeFilename("ytt")
  );
  showStatus(
    "YTTファイルを書き出しました。YouTubeにアップロードして表示を確認してください。"
  );
}
/* ========================================
   イベント設定
======================================== */
addLayerButton.addEventListener("click", addLayer);
undoButton.addEventListener("click", undoEdit);
redoButton.addEventListener("click", redoEdit);
document.getElementById("previousLayerButton")
  .addEventListener("click", () => navigateLayer(-1));

document.getElementById("nextLayerButton")
  .addEventListener("click", () => navigateLayer(1));
$("addTextButton").addEventListener("click", addText);
applyLayerTimeButton.addEventListener("click", applyLayerTime);
applyPositionButton.addEventListener("click", applyPosition);
deleteTextButton.addEventListener("click", deleteSelectedText);
applyFontSizeButton.addEventListener("click", applyFontSize);
saveButton.addEventListener("click", saveProject);
loadButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) {
    loadProjectFile(file);
  }
  fileInput.value = "";
});
playButton.addEventListener("click", playPreview);
stopButton.addEventListener("click", () => stopPreview(true));
playbackProgress.addEventListener("input", () => {
  seekPlayback(playbackProgress.value);
});
exportVttButton.addEventListener("click", exportVtt);
exportYttButton.addEventListener("click", exportYtt);
/* ========================================
   起動時の初期設定
======================================== */
const firstLayer = createLayer(0, 2);
firstLayer.name = "レイヤー1";
layers.push(firstLayer);
selectLayer(firstLayer.id);
updatePlaybackDisplay();
showStatus("準備完了！レイヤーに文章を追加できます。");