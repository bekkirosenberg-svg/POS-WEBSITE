// LocalStorage Database Keys
const DB_ACCOUNTS = 'pos_accounts';
const DB_PRODUCTS = 'pos_products';
const DB_HISTORY = 'pos_history';
const DB_THEME = 'pos_theme';
const DB_SETTINGS = 'pos_settings';

// State Management
let accounts = JSON.parse(localStorage.getItem(DB_ACCOUNTS)) || [];
let products = JSON.parse(localStorage.getItem(DB_PRODUCTS)) || [];
let history = JSON.parse(localStorage.getItem(DB_HISTORY)) || [];
let settings = JSON.parse(localStorage.getItem(DB_SETTINGS)) || {
  sound: 'enabled',
  cooldown: 400,
  fps: 60
};

let activeAccount = null;
let cart = [];
let html5QrcodeScanner = null;
let instantScannerInstance = null;
let currentCameraId = null;
let currentScanTarget = 'cart';
let photoStream = null;
let lastScannedCode = '';
let scanCooldownTimer = null;

// Audio Feedback System
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playSound(type) {
  if (settings.sound === 'disabled') return;

  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'add') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'success') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.2);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch (e) {
    console.warn('Audio output blocked:', e);
  }
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSettingsUI();
  createNotificationContainer();
  renderAccountsTable();
  renderInventoryGrid();
  renderStoreProducts();
  renderHistoryTable();
  initInstantScanner();
});

// Dynamic Fruit & Juice Catalog Generator (Generates up to 200+ unique products)
function buildUniqueProductCatalog() {
  const prefixes = ['Fresh', 'Organic', 'Cold-Pressed', 'Raw', 'Sweet', 'Tropical', 'Artisanal', 'Wild', 'Sun-Ripened', 'Sparkling', 'Smooth', 'Premium'];
  const fruits = [
    { name: 'Apple', basePrice: 1.50, img: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=200' },
    { name: 'Banana', basePrice: 0.80, img: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=200' },
    { name: 'Orange', basePrice: 1.20, img: 'https://images.unsplash.com/photo-1547514701-42782101795e?w=200' },
    { name: 'Strawberry', basePrice: 3.50, img: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=200' },
    { name: 'Mango', basePrice: 2.50, img: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=200' },
    { name: 'Watermelon', basePrice: 2.00, img: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=200' },
    { name: 'Pineapple', basePrice: 3.00, img: 'https://images.unsplash.com/photo-1525385133512-2f3bdd039054?w=200' },
    { name: 'Blueberry', basePrice: 4.20, img: 'https://images.unsplash.com/photo-1498557850523-fd3d118b962e?w=200' },
    { name: 'Raspberry', basePrice: 4.50, img: 'https://images.unsplash.com/photo-1577069861033-55d04ace4ef0?w=200' },
    { name: 'Peach', basePrice: 1.80, img: 'https://images.unsplash.com/photo-1595123550441-d377e017de6a?w=200' },
    { name: 'Kiwi', basePrice: 1.10, img: 'https://images.unsplash.com/photo-1585059819970-3136821203d9?w=200' },
    { name: 'Pomegranate', basePrice: 3.80, img: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=200' },
    { name: 'Grapefruit', basePrice: 1.60, img: 'https://images.unsplash.com/photo-1528821128474-27f963b072b7?w=200' },
    { name: 'Blackberry', basePrice: 4.00, img: 'https://images.unsplash.com/photo-1438156630538-213234155291?w=200' },
    { name: 'Papaya', basePrice: 2.90, img: 'https://images.unsplash.com/photo-1517282009859-f000ec3b26fe?w=200' },
    { name: 'Guava', basePrice: 2.20, img: 'https://images.unsplash.com/photo-1536511135882-72fc78a48705?w=200' },
    { name: 'Dragonfruit', basePrice: 4.90, img: 'https://images.unsplash.com/photo-1527325678964-549216468488?w=200' },
    { name: 'Cranberry', basePrice: 3.20, img: 'https://images.unsplash.com/photo-1605371924599-2d0365da1ae0?w=200' }
  ];
  
  const types = ['Juice', 'Smoothie', 'Nectar', 'Slice', 'Puree', 'Cooler', 'Extract', 'Blend', 'Water', 'Cider'];

  const catalog = [];
  let barcodeCounter = 800100000;

  for (let f of fruits) {
    catalog.push({
      name: `Fresh ${f.name}`,
      price: f.basePrice,
      stock: 50,
      code: String(barcodeCounter++),
      image: f.img
    });
  }

  for (let p of prefixes) {
    for (let f of fruits) {
      for (let t of types) {
        if (catalog.length >= 300) break;
        const name = `${p} ${f.name} ${t}`;
        
        let price = f.basePrice + (t.includes('Juice') || t.includes('Smoothie') ? 2.50 : 1.00);
        
        catalog.push({
          name: name,
          price: parseFloat(price.toFixed(2)),
          stock: Math.floor(Math.random() * 60) + 20,
          code: String(barcodeCounter++),
          image: f.img
        });
      }
    }
  }

  return catalog;
}

// Auto-Product Generation & Deletion Features
function generateAutoProducts() {
  const countInput = document.getElementById('auto-gen-count');
  let requestedCount = parseInt(countInput ? countInput.value : 150, 10);

  if (isNaN(requestedCount) || requestedCount < 1) requestedCount = 1;
  if (requestedCount > 200) requestedCount = 200;

  const fullCatalog = buildUniqueProductCatalog();
  let addedCount = 0;

  for (let demoItem of fullCatalog) {
    if (addedCount >= requestedCount) break;

    const exists = products.some(p => p.code === demoItem.code || p.name.toLowerCase() === demoItem.name.toLowerCase());

    if (!exists) {
      products.push({
        ...demoItem,
        isAutoGenerated: true
      });
      addedCount++;
    }
  }

  if (addedCount > 0) {
    saveData(DB_PRODUCTS, products);
    renderInventoryGrid();
    renderStoreProducts();
    showNotification(`Generated ${addedCount} unique fruit & juice items!`, "success");
  } else {
    showNotification("Requested unique items already exist in inventory!", "warning");
  }
}

function clearAutoProducts() {
  const initialCount = products.length;

  products = products.filter(p => !p.isAutoGenerated && !(p.code >= '800100000' && p.code <= '800100500'));

  const removedCount = initialCount - products.length;

  if (removedCount > 0) {
    cart = cart.filter(cartItem => products.some(p => p.code === cartItem.code));

    saveData(DB_PRODUCTS, products);
    renderInventoryGrid();
    renderStoreProducts();
    renderCart();
    showNotification(`Deleted ${removedCount} auto-generated products!`, "warning");
  } else {
    showNotification("No auto-generated products found to delete.", "info");
  }
}

// UI Theme & Settings
function initTheme() {
  const savedTheme = localStorage.getItem(DB_THEME) || 'dark';
  applyTheme(savedTheme);
}

function applyTheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem(DB_THEME, themeName);
  updateThemeButton(themeName);
}

function quickToggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
}

function updateThemeButton(theme) {
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerText = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
}

function initSettingsUI() {
  const soundSelect = document.getElementById('setting-sound');
  const cooldownSelect = document.getElementById('setting-scan-cooldown');
  const fpsSelect = document.getElementById('setting-fps');

  if (soundSelect) soundSelect.value = settings.sound;
  if (cooldownSelect) cooldownSelect.value = settings.cooldown;
  if (fpsSelect) fpsSelect.value = settings.fps;
}

function saveSettings() {
  settings.sound = document.getElementById('setting-sound').value;
  settings.cooldown = parseInt(document.getElementById('setting-scan-cooldown').value, 10);
  settings.fps = parseInt(document.getElementById('setting-fps').value, 10);

  localStorage.setItem(DB_SETTINGS, JSON.stringify(settings));
  showNotification("Settings updated!", "success");

  if (instantScannerInstance && instantScannerInstance.isScanning) {
    instantScannerInstance.stop().then(() => initInstantScanner());
  }
}

function createNotificationContainer() {
  if (!document.getElementById('notification-container')) {
    const container = document.createElement('div');
    container.id = 'notification-container';
    document.body.appendChild(container);
  }
}

function showNotification(message, type = 'error') {
  const container = document.getElementById('notification-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerText = message;

  container.appendChild(toast);

  if (type === 'error') playSound('error');
  else if (type === 'success') playSound('success');

  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  
  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');

  const activeBtn = document.querySelector(`.nav-btn[onclick*="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

// High-Speed Instant Live Scanner
async function initInstantScanner() {
  const readerContainer = document.getElementById('instant-reader');
  if (!readerContainer) return;

  try {
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length > 0) {
      const selectedCamId = devices.length > 1 ? devices[devices.length - 1].id : devices[0].id;
      
      if (instantScannerInstance) {
        try { await instantScannerInstance.stop(); } catch(e) {}
      }

      instantScannerInstance = new Html5Qrcode("instant-reader", {
        useBarCodeDetectorIfSupported: true,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE
        ]
      });

      const config = {
        fps: settings.fps || 60,
        qrbox: { width: 280, height: 140 },
        videoConstraints: {
          facingMode: "environment",
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 }
        }
      };

      instantScannerInstance.start(
        selectedCamId,
        config,
        (decodedText) => {
          if (decodedText === lastScannedCode) return;
          lastScannedCode = decodedText;
          
          addToCartByBarcode(decodedText);

          clearTimeout(scanCooldownTimer);
          scanCooldownTimer = setTimeout(() => {
            lastScannedCode = '';
          }, settings.cooldown || 400);
        },
        () => {}
      ).catch(e => console.warn("Live scanner starting standby:", e));
    }
  } catch (err) {
    console.warn("Live scanner waiting for camera permissions:", err);
  }
}

function toggleInstantScanner() {
  if (instantScannerInstance && instantScannerInstance.isScanning) {
    instantScannerInstance.stop().then(() => {
      showNotification("Live scanner paused", "info");
    });
  } else {
    initInstantScanner();
  }
}

// Photo Snapshot & Auto Background Removal
async function openPhotoCaptureModal() {
  const modal = document.getElementById('photo-modal');
  const video = document.getElementById('photo-video');
  modal.classList.remove('hidden');

  try {
    photoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = photoStream;
  } catch (err) {
    console.error("Camera snapshot error:", err);
    showNotification("Could not start camera for product picture.", "error");
    closePhotoModal();
  }
}

function closePhotoModal() {
  const modal = document.getElementById('photo-modal');
  modal.classList.add('hidden');

  if (photoStream) {
    photoStream.getTracks().forEach(track => track.stop());
    photoStream = null;
  }
}

function captureAndRemoveBackground() {
  const video = document.getElementById('photo-video');
  if (!video || !photoStream) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  const bgR = data[0];
  const bgG = data[1];
  const bgB = data[2];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const isLightBackground = (r > 190 && g > 190 && b > 190);
    const colorDist = Math.sqrt(Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2));

    if (isLightBackground || colorDist < 65) {
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const transparentPNG = canvas.toDataURL('image/png');

  document.getElementById('prod-image-data').value = transparentPNG;
  const previewImg = document.getElementById('product-photo-preview');
  previewImg.src = transparentPNG;
  document.getElementById('product-photo-preview-container').classList.remove('hidden');

  closePhotoModal();
  showNotification("Product picture saved with background removed!", "success");
}

// Modal Scanner & Barcodes
function generateRandomBarcode() {
  const code = Math.floor(100000000000 + Math.random() * 900000000000).toString();
  document.getElementById('prod-code').value = code;
}

function showBarcodeModal(code, name) {
  const labelHeader = document.getElementById('print-label-header');
  if (labelHeader) labelHeader.innerText = code;
  
  JsBarcode("#barcode-canvas", code, {
    format: "CODE128",
    lineColor: "#000",
    width: 2.5,
    height: 90,
    displayValue: false
  });

  document.getElementById('barcode-modal').classList.remove('hidden');
}

function closeBarcodeModal() {
  document.getElementById('barcode-modal').classList.add('hidden');
}

async function openScanner(target = 'cart') {
  currentScanTarget = target;
  const modal = document.getElementById('scanner-modal');
  modal.classList.remove('hidden');

  const cameraSelect = document.getElementById('camera-select');
  cameraSelect.innerHTML = '<option value="">Searching for cameras...</option>';

  try {
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length > 0) {
      cameraSelect.innerHTML = '';
      devices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.id;
        option.innerText = device.label || `Camera ${index + 1}`;
        cameraSelect.appendChild(option);
      });

      currentCameraId = devices.length > 1 ? devices[devices.length - 1].id : devices[0].id;
      cameraSelect.value = currentCameraId;
      startCameraStream(currentCameraId);
    } else {
      cameraSelect.innerHTML = '<option value="">No cameras found</option>';
      showNotification("No cameras detected.", "error");
    }
  } catch (err) {
    cameraSelect.innerHTML = '<option value="">Camera error</option>';
    showNotification("Camera access denied or unavailable.", "error");
  }
}

function startCameraStream(cameraId) {
  stopActiveCamera().then(() => {
    html5QrcodeScanner = new Html5Qrcode("reader", {
      useBarCodeDetectorIfSupported: true,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.QR_CODE
      ]
    });

    const config = { fps: 60, qrbox: { width: 280, height: 160 } };

    html5QrcodeScanner.start(
      cameraId,
      config,
      (decodedText) => {
        handleScannedCode(decodedText);
        closeScanner();
      },
      () => {}
    ).catch(err => {
      showNotification("Failed to open camera stream.", "error");
    });
  });
}

function switchCamera(newCameraId) {
  if (newCameraId && newCameraId !== currentCameraId) {
    currentCameraId = newCameraId;
    startCameraStream(newCameraId);
  }
}

function handleScannedCode(barcode) {
  if (currentScanTarget === 'product') {
    document.getElementById('prod-code').value = barcode;
    showNotification(`Scanned Barcode: ${barcode}`, "success");
  } else {
    addToCartByBarcode(barcode);
  }
}

function stopActiveCamera() {
  return new Promise((resolve) => {
    if (html5QrcodeScanner) {
      html5QrcodeScanner.stop().then(() => {
        html5QrcodeScanner.clear();
        html5QrcodeScanner = null;
        resolve();
      }).catch(() => {
        html5QrcodeScanner = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

function closeScanner() {
  const modal = document.getElementById('scanner-modal');
  stopActiveCamera().finally(() => {
    modal.classList.add('hidden');
  });
}

function addToCartByBarcode(barcode) {
  const prod = products.find(p => p.code === barcode);
  if (prod) {
    addToCart(prod.code);
    showNotification(`Added: ${prod.name}`, "success");
  } else {
    showNotification(`No product matched barcode #${barcode}`, "error");
  }
}

// Customer Account Operations
function handleAccountFormSubmit(e) {
  e.preventDefault();
  const originalAccNum = document.getElementById('editing-acc-original').value;
  const accNum = document.getElementById('cust-acc-num').value.trim();
  const phone = document.getElementById('cust-phone').value.trim();
  const emailInput = document.getElementById('cust-email').value.trim();

  if (!/^\d+$/.test(accNum) || !/^\d+$/.test(phone)) {
    showNotification("Account and Phone numbers must contain numbers only!", "error");
    return;
  }

  if ((!originalAccNum || originalAccNum !== accNum) && accounts.some(a => a.accNum === accNum)) {
    showNotification("Account number already exists!", "error");
    return;
  }

  if (originalAccNum) {
    const accIndex = accounts.findIndex(a => a.accNum === originalAccNum);
    if (accIndex !== -1) {
      accounts[accIndex] = {
        accNum, name: document.getElementById('cust-name').value.trim(),
        phone, email: emailInput !== '' ? emailInput : 'N/A',
        address: document.getElementById('cust-address').value.trim(),
        balance: parseFloat(document.getElementById('cust-balance').value) || 0
      };
      if (activeAccount && activeAccount.accNum === originalAccNum) {
        activeAccount = accounts[accIndex];
        updateAccountUI();
      }
      showNotification("Account updated!", "success");
    }
  } else {
    accounts.push({
      accNum, name: document.getElementById('cust-name').value.trim(),
      phone, email: emailInput !== '' ? emailInput : 'N/A',
      address: document.getElementById('cust-address').value.trim(),
      balance: parseFloat(document.getElementById('cust-balance').value) || 0
    });
    showNotification("Account created!", "success");
  }

  saveData(DB_ACCOUNTS, accounts);
  renderAccountsTable();
  resetCustomerForm();
}

function startEditAccount(accNum) {
  const acc = accounts.find(a => a.accNum === accNum);
  if (!acc) return;

  document.getElementById('cust-form-title').innerText = 'Edit Customer Account';
  document.getElementById('editing-acc-original').value = acc.accNum;
  document.getElementById('cust-acc-num').value = acc.accNum;
  document.getElementById('cust-name').value = acc.name;
  document.getElementById('cust-phone').value = acc.phone;
  document.getElementById('cust-email').value = acc.email === 'N/A' ? '' : acc.email;
  document.getElementById('cust-address').value = acc.address;
  document.getElementById('cust-balance').value = acc.balance;

  document.getElementById('cust-submit-btn').innerText = 'Update Account';
  document.getElementById('cust-cancel-btn').classList.remove('hidden');
}

function resetCustomerForm() {
  document.getElementById('create-account-form').reset();
  document.getElementById('editing-acc-original').value = '';
  document.getElementById('cust-form-title').innerText = 'Create New Account';
  document.getElementById('cust-submit-btn').innerText = 'Create Account';
  document.getElementById('cust-cancel-btn').classList.add('hidden');
}

function renderAccountsTable() {
  const tbody = document.getElementById('customers-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  accounts.forEach(acc => {
    tbody.innerHTML += `
      <tr>
        <td><strong>${acc.accNum}</strong></td>
        <td>${acc.name}</td>
        <td>${acc.phone}</td>
        <td>$${acc.balance.toFixed(2)}</td>
        <td>
          <button class="btn btn-warning btn-animated" onclick="startEditAccount('${acc.accNum}')">Edit</button>
          <button class="btn btn-danger btn-animated" onclick="deleteAccount('${acc.accNum}')">Delete</button>
        </td>
      </tr>
    `;
  });
}

function deleteAccount(accNum) {
  if (confirm(`Delete account #${accNum}?`)) {
    accounts = accounts.filter(a => a.accNum !== accNum);
    saveData(DB_ACCOUNTS, accounts);
    renderAccountsTable();
    if (activeAccount && activeAccount.accNum === accNum) {
      activeAccount = null;
      document.getElementById('active-account-card').classList.add('hidden');
    }
    showNotification(`Account #${accNum} deleted`, "warning");
  }
}

function lookupAccount() {
  const query = document.getElementById('lookup-acc-num').value.trim();
  const acc = accounts.find(a => a.accNum === query);

  if (!acc) {
    showNotification("Account not found!", "error");
    return;
  }

  activeAccount = acc;
  updateAccountUI();
  showNotification(`Loaded account #${acc.accNum}`, "info");
}

function updateAccountUI() {
  if (!activeAccount) return;
  document.getElementById('active-account-card').classList.remove('hidden');
  document.getElementById('acc-disp-name').innerText = activeAccount.name;
  document.getElementById('acc-disp-num').innerText = `#${activeAccount.accNum}`;
  document.getElementById('acc-disp-phone').innerText = activeAccount.phone;
  document.getElementById('acc-disp-email').innerText = activeAccount.email;
  document.getElementById('acc-disp-address').innerText = activeAccount.address;
  document.getElementById('acc-disp-balance').innerText = `$${activeAccount.balance.toFixed(2)}`;
}

function modifyBalance(action) {
  if (!activeAccount) return;
  const amtInput = document.getElementById('balance-amount');
  const amount = parseFloat(amtInput.value);

  if (isNaN(amount) || amount <= 0) {
    showNotification("Enter a valid amount.", "error");
    return;
  }

  if (action === 'add') {
    activeAccount.balance += amount;
    showNotification(`Added $${amount.toFixed(2)}`, "success");
  } else if (action === 'remove') {
    if (activeAccount.balance < amount) {
      showNotification("Insufficient account balance!", "error");
      return;
    }
    activeAccount.balance -= amount;
    showNotification(`Removed $${amount.toFixed(2)}`, "warning");
  }

  saveData(DB_ACCOUNTS, accounts);
  updateAccountUI();
  renderAccountsTable();
  amtInput.value = '';
}

// Product Operations
function handleProductFormSubmit(e) {
  e.preventDefault();
  const originalCode = document.getElementById('editing-prod-original').value;
  const code = document.getElementById('prod-code').value.trim();
  const imgDataInput = document.getElementById('prod-image-data').value;

  if (!/^\d+$/.test(code)) {
    showNotification("Barcode must contain numbers only!", "error");
    return;
  }

  if ((!originalCode || originalCode !== code) && products.some(p => p.code === code)) {
    showNotification("A product with this barcode already exists!", "error");
    return;
  }

  const existingProd = originalCode ? products.find(p => p.code === originalCode) : null;

  const updatedProd = {
    code,
    name: document.getElementById('prod-name').value.trim(),
    price: parseFloat(document.getElementById('prod-price').value),
    stock: parseInt(document.getElementById('prod-stock').value),
    image: imgDataInput || (existingProd ? existingProd.image : 'https://via.placeholder.com/100?text=No+Image')
  };

  if (originalCode) {
    const prodIndex = products.findIndex(p => p.code === originalCode);
    if (prodIndex !== -1) products[prodIndex] = updatedProd;
    showNotification("Product updated!", "success");
  } else {
    products.push(updatedProd);
    showNotification("Product saved!", "success");
  }

  saveData(DB_PRODUCTS, products);
  renderInventoryGrid();
  renderStoreProducts();
  resetProductForm();
}

function startEditProduct(code) {
  const prod = products.find(p => p.code === code);
  if (!prod) return;

  document.getElementById('prod-form-title').innerText = 'Edit Product';
  document.getElementById('editing-prod-original').value = prod.code;
  document.getElementById('prod-code').value = prod.code;
  document.getElementById('prod-name').value = prod.name;
  document.getElementById('prod-price').value = prod.price;
  document.getElementById('prod-stock').value = prod.stock;
  document.getElementById('prod-image-data').value = prod.image;

  if (prod.image) {
    document.getElementById('product-photo-preview').src = prod.image;
    document.getElementById('product-photo-preview-container').classList.remove('hidden');
  }

  document.getElementById('prod-submit-btn').innerText = 'Update Product';
  document.getElementById('prod-cancel-btn').classList.remove('hidden');
}

function resetProductForm() {
  document.getElementById('add-product-form').reset();
  document.getElementById('editing-prod-original').value = '';
  document.getElementById('prod-image-data').value = '';
  document.getElementById('product-photo-preview-container').classList.add('hidden');
  document.getElementById('prod-form-title').innerText = 'Add Product';
  document.getElementById('prod-submit-btn').innerText = 'Save Product';
  document.getElementById('prod-cancel-btn').classList.add('hidden');
}

function renderInventoryGrid() {
  const grid = document.getElementById('inventory-grid');
  if (!grid) return;
  grid.innerHTML = '';
  
  products.forEach(p => {
    grid.innerHTML += `
      <div class="prod-card">
        <div class="prod-card-img-wrapper">
          <img src="${p.image}" alt="${p.name}" />
        </div>
        <strong>${p.name}</strong>
        <p>$${p.price.toFixed(2)} | Stock: ${p.stock}</p>
        <small>Code: ${p.code}</small>
        <div style="display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.5rem;">
          <button class="btn btn-primary btn-animated btn-block" onclick="showBarcodeModal('${p.code}', '${p.name}')">🖨️ Barcode</button>
          <div style="display: flex; gap: 0.25rem;">
            <button class="btn btn-warning btn-animated btn-block" onclick="startEditProduct('${p.code}')">Edit</button>
            <button class="btn btn-danger btn-animated btn-block" onclick="deleteProduct('${p.code}')">Delete</button>
          </div>
        </div>
      </div>
    `;
  });
}

function deleteProduct(code) {
  if (confirm(`Delete product code #${code}?`)) {
    products = products.filter(p => p.code !== code);
    saveData(DB_PRODUCTS, products);
    renderInventoryGrid();
    renderStoreProducts();
    cart = cart.filter(item => item.code !== code);
    renderCart();
    showNotification("Product deleted", "warning");
  }
}

function renderStoreProducts() {
  const queryInput = document.getElementById('pos-search');
  const query = queryInput ? queryInput.value.toLowerCase() : '';
  const grid = document.getElementById('pos-product-grid');
  if (!grid) return;
  grid.innerHTML = '';

  products
    .filter(p => p.name.toLowerCase().includes(query) || p.code.toLowerCase().includes(query))
    .forEach(p => {
      grid.innerHTML += `
        <div class="prod-card" onclick="addToCart('${p.code}')">
          <div class="prod-card-img-wrapper">
            <img src="${p.image}" alt="${p.name}" />
          </div>
          <strong>${p.name}</strong>
          <p>$${p.price.toFixed(2)}</p>
          <small>Stock: ${p.stock}</small>
        </div>
      `;
    });
}

// Cart & Checkout
function addToCart(code) {
  const prod = products.find(p => p.code === code);
  if (!prod || prod.stock <= 0) {
    showNotification("Product is out of stock!", "error");
    return;
  }

  const cartItem = cart.find(item => item.code === code);
  if (cartItem) {
    if (cartItem.qty >= prod.stock) {
      showNotification("Cannot exceed available stock limit!", "error");
      return;
    }
    cartItem.qty++;
  } else {
    cart.push({ ...prod, qty: 1 });
  }

  playSound('add');
  renderCart();
}

function updateCartQty(code, change) {
  const cartItem = cart.find(item => item.code === code);
  if (!cartItem) return;

  const prod = products.find(p => p.code === code);

  if (change > 0) {
    if (prod && cartItem.qty >= prod.stock) {
      showNotification("Cannot exceed available stock limit!", "error");
      return;
    }
    cartItem.qty++;
  } else if (change < 0) {
    cartItem.qty--;
    if (cartItem.qty <= 0) {
      removeFromCart(code);
      return;
    }
  }

  renderCart();
}

function removeFromCart(code) {
  cart = cart.filter(item => item.code !== code);
  renderCart();
  showNotification("Item removed from cart", "warning");
}

function clearCart() {
  if (cart.length === 0) return;
  cart = [];
  renderCart();
  showNotification("Cart cleared", "warning");
}

function renderCart() {
  const cartList = document.getElementById('cart-list');
  if (!cartList) return;
  cartList.innerHTML = '';
  let subtotal = 0;

  cart.forEach(item => {
    const itemTotal = item.price * item.qty;
    subtotal += itemTotal;
    cartList.innerHTML += `
      <li class="cart-item">
        <div class="cart-item-info">
          <strong>${item.name}</strong>
          <small>$${item.price.toFixed(2)} x ${item.qty} = $${itemTotal.toFixed(2)}</small>
        </div>
        <div class="cart-controls">
          <button class="btn btn-warning btn-animated btn-qty" onclick="updateCartQty('${item.code}', -1)">-</button>
          <span>${item.qty}</span>
          <button class="btn btn-success btn-animated btn-qty" onclick="updateCartQty('${item.code}', 1)">+</button>
          <button class="btn-remove-item" onclick="removeFromCart('${item.code}')">&times;</button>
        </div>
      </li>
    `;
  });

  const discountInput = document.getElementById('cart-discount');
  const taxInput = document.getElementById('cart-tax');

  const discountPercent = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
  const taxPercent = taxInput ? (parseFloat(taxInput.value) || 0) : 0;

  const discountAmount = subtotal * (discountPercent / 100);
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxableAmount * (taxPercent / 100);
  const finalTotal = taxableAmount + taxAmount;

  document.getElementById('cart-subtotal-price').innerText = `$${subtotal.toFixed(2)}`;
  document.getElementById('cart-discount-price').innerText = `-$${discountAmount.toFixed(2)}`;
  document.getElementById('cart-tax-price').innerText = `+$${taxAmount.toFixed(2)}`;
  document.getElementById('cart-total-price').innerText = `$${finalTotal.toFixed(2)}`;
}

function processCheckout() {
  if (!activeAccount) {
    showNotification("Load a customer account before checking out!", "error");
    return;
  }

  if (cart.length === 0) {
    showNotification("Cart is empty!", "error");
    return;
  }

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discountPercent = parseFloat(document.getElementById('cart-discount').value) || 0;
  const taxPercent = parseFloat(document.getElementById('cart-tax').value) || 0;

  const discountAmount = subtotal * (discountPercent / 100);
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxableAmount * (taxPercent / 100);
  const totalCost = taxableAmount + taxAmount;

  if (activeAccount.balance < totalCost) {
    showNotification("Customer balance is too low!", "error");
    return;
  }

  activeAccount.balance -= totalCost;

  cart.forEach(cartItem => {
    const storeProd = products.find(p => p.code === cartItem.code);
    if (storeProd) storeProd.stock -= cartItem.qty;
  });

  history.unshift({
    date: new Date().toLocaleString(),
    accNum: activeAccount.accNum,
    customerName: activeAccount.name,
    items: cart.map(i => `${i.name} (x${i.qty})`).join(', '),
    subtotal, discount: discountAmount, tax: taxAmount, total: totalCost
  });

  saveData(DB_ACCOUNTS, accounts);
  saveData(DB_PRODUCTS, products);
  saveData(DB_HISTORY, history);

  cart = [];
  document.getElementById('cart-discount').value = 0;
  renderCart();
  updateAccountUI();
  renderAccountsTable();
  renderInventoryGrid();
  renderStoreProducts();
  renderHistoryTable();

  showNotification("Checkout complete!", "success");
}

function renderHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  history.forEach((h, index) => {
    const subtotalText = h.subtotal !== undefined ? `$${h.subtotal.toFixed(2)}` : 'N/A';
    const adjustmentsText = (h.discount !== undefined && h.tax !== undefined)
      ? `-$${h.discount.toFixed(2)} / +$${h.tax.toFixed(2)}` 
      : 'N/A';

    tbody.innerHTML += `
      <tr>
        <td>${h.date}</td>
        <td>#${h.accNum}</td>
        <td>${h.customerName}</td>
        <td>${h.items}</td>
        <td>${subtotalText}</td>
        <td><small>${adjustmentsText}</small></td>
        <td><strong>$${h.total.toFixed(2)}</strong></td>
        <td><button class="btn btn-danger btn-animated" onclick="deleteHistoryEntry(${index})">Delete</button></td>
      </tr>
    `;
  });
}

function deleteHistoryEntry(index) {
  if (confirm("Delete this history record?")) {
    history.splice(index, 1);
    saveData(DB_HISTORY, history);
    renderHistoryTable();
    showNotification("Entry deleted", "warning");
  }
}

function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}
