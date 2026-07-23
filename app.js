// LocalStorage Database Keys
const DB_ACCOUNTS = 'pos_accounts';
const DB_PRODUCTS = 'pos_products';
const DB_HISTORY = 'pos_history';
const DB_THEME = 'pos_theme';

// State Management
let accounts = JSON.parse(localStorage.getItem(DB_ACCOUNTS)) || [];
let products = JSON.parse(localStorage.getItem(DB_PRODUCTS)) || [];
let history = JSON.parse(localStorage.getItem(DB_HISTORY)) || [];

let activeAccount = null;
let cart = [];
let html5QrcodeScanner = null;
let currentCameraId = null;

// Audio Feedback
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playSound(type) {
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
    console.warn('Audio blocked:', e);
  }
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  createNotificationContainer();
  renderAccountsTable();
  renderInventoryGrid();
  renderStoreProducts();
  renderHistoryTable();
});

// UI Theme
function initTheme() {
  const savedTheme = localStorage.getItem(DB_THEME) || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButton(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem(DB_THEME, newTheme);
  updateThemeButton(newTheme);
}

function updateThemeButton(theme) {
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerText = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
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
  }, 3500);
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  
  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');

  const activeBtn = document.querySelector(`.nav-btn[onclick*="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

// ----------------------------------------------------
// BARCODE GENERATION, PRINTING & CAMERA SCANNING
// ----------------------------------------------------

function generateRandomBarcode() {
  const code = Math.floor(100000000000 + Math.random() * 900000000000).toString();
  document.getElementById('prod-code').value = code;
}

function scanBarcodeImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const html5QrCode = new Html5Qrcode("reader");
  html5QrCode.scanFile(file, true)
    .then(decodedText => {
      document.getElementById('prod-code').value = decodedText;
      showNotification(`Extracted Barcode: ${decodedText}`, "success");
    })
    .catch(() => {
      showNotification("Could not read barcode from image", "error");
    });
}

function showBarcodeModal(code, name) {
  document.getElementById('barcode-modal-title').innerText = `${name} (#${code})`;
  
  JsBarcode("#barcode-canvas", code, {
    format: "CODE128",
    lineColor: "#000",
    width: 2,
    height: 80,
    displayValue: true
  });

  document.getElementById('barcode-modal').classList.remove('hidden');
}

function closeBarcodeModal() {
  document.getElementById('barcode-modal').classList.add('hidden');
}

// Open Camera Scanner & Detect Available Webcams / External Cameras
async function openScanner() {
  const modal = document.getElementById('scanner-modal');
  modal.classList.remove('hidden');

  if (window.location.protocol === 'file:') {
    showNotification("Camera access requires hosting via web server (e.g., Live Server), not file://", "error");
  }

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

      // Default to the first detected camera or back camera
      currentCameraId = devices[0].id;
      startCameraStream(currentCameraId);
    } else {
      cameraSelect.innerHTML = '<option value="">No cameras found</option>';
      showNotification("No cameras detected on this device.", "error");
    }
  } catch (err) {
    console.error("Camera detection error:", err);
    cameraSelect.innerHTML = '<option value="">Camera access denied</option>';
    showNotification("Camera access denied or unavailable.", "error");
  }
}

// Start Stream for Selected Camera ID
function startCameraStream(cameraId) {
  stopActiveCamera().then(() => {
    html5QrcodeScanner = new Html5Qrcode("reader");
    html5QrcodeScanner.start(
      cameraId,
      { fps: 15, qrbox: { width: 250, height: 150 } },
      (decodedText) => {
        addToCartByBarcode(decodedText);
        closeScanner();
      },
      () => {}
    ).catch(err => {
      console.error("Failed to start stream:", err);
      showNotification("Failed to open selected camera.", "error");
    });
  });
}

function switchCamera(newCameraId) {
  if (newCameraId && newCameraId !== currentCameraId) {
    currentCameraId = newCameraId;
    startCameraStream(newCameraId);
  }
}

// Helper to Stop Camera Stream safely
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

// Always Close Modal Safely
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
    showNotification(`Scanned & Added: ${prod.name}`, "success");
  } else {
    showNotification(`No product found with barcode #${barcode}`, "error");
  }
}

// Account Operations
function handleAccountFormSubmit(e) {
  e.preventDefault();
  const originalAccNum = document.getElementById('editing-acc-original').value;
  const accNum = document.getElementById('cust-acc-num').value.trim();
  const phone = document.getElementById('cust-phone').value.trim();
  const emailInput = document.getElementById('cust-email').value.trim();

  if (!/^\d+$/.test(accNum) || !/^\d+$/.test(phone)) {
    showNotification("Account and Phone numbers must be numeric!", "error");
    return;
  }

  if ((!originalAccNum || originalAccNum !== accNum) && accounts.some(a => a.accNum === accNum)) {
    showNotification("An account with this number already exists!", "error");
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
      showNotification("Account updated successfully!", "success");
    }
  } else {
    accounts.push({
      accNum, name: document.getElementById('cust-name').value.trim(),
      phone, email: emailInput !== '' ? emailInput : 'N/A',
      address: document.getElementById('cust-address').value.trim(),
      balance: parseFloat(document.getElementById('cust-balance').value) || 0
    });
    showNotification("Account created successfully!", "success");
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
          <button class="btn btn-warning" onclick="startEditAccount('${acc.accNum}')">Edit</button>
          <button class="btn btn-danger" onclick="deleteAccount('${acc.accNum}')">Delete</button>
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
      showNotification("Error: Insufficient balance!", "error");
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

// Product & Inventory
function handleProductFormSubmit(e) {
  e.preventDefault();
  const originalCode = document.getElementById('editing-prod-original').value;
  const code = document.getElementById('prod-code').value.trim();
  const fileInput = document.getElementById('prod-image');

  if (!/^\d+$/.test(code)) {
    showNotification("Product code/barcode must contain numbers only!", "error");
    return;
  }

  if ((!originalCode || originalCode !== code) && products.some(p => p.code === code)) {
    showNotification("A product with this barcode already exists!", "error");
    return;
  }

  const existingProd = originalCode ? products.find(p => p.code === originalCode) : null;

  const saveProductData = (imgData) => {
    const updatedProd = {
      code, name: document.getElementById('prod-name').value.trim(),
      price: parseFloat(document.getElementById('prod-price').value),
      stock: parseInt(document.getElementById('prod-stock').value),
      image: imgData || (existingProd ? existingProd.image : 'https://via.placeholder.com/100?text=No+Image')
    };

    if (originalCode) {
      const prodIndex = products.findIndex(p => p.code === originalCode);
      if (prodIndex !== -1) products[prodIndex] = updatedProd;
      showNotification("Product updated successfully!", "success");
    } else {
      products.push(updatedProd);
      showNotification("Product added successfully!", "success");
    }

    saveData(DB_PRODUCTS, products);
    renderInventoryGrid();
    renderStoreProducts();
    resetProductForm();
  };

  if (fileInput.files && fileInput.files[0]) {
    const reader = new FileReader();
    reader.onload = (event) => saveProductData(event.target.result);
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    saveProductData(null);
  }
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

  document.getElementById('prod-submit-btn').innerText = 'Update Product';
  document.getElementById('prod-cancel-btn').classList.remove('hidden');
}

function resetProductForm() {
  document.getElementById('add-product-form').reset();
  document.getElementById('editing-prod-original').value = '';
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
        <img src="${p.image}" alt="${p.name}" />
        <strong>${p.name}</strong>
        <p>$${p.price.toFixed(2)} | Stock: ${p.stock}</p>
        <small>Code: ${p.code}</small>
        <div style="display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.5rem;">
          <button class="btn btn-primary btn-block" onclick="showBarcodeModal('${p.code}', '${p.name}')">🖨️ Barcode</button>
          <div style="display: flex; gap: 0.25rem;">
            <button class="btn btn-warning btn-block" onclick="startEditProduct('${p.code}')">Edit</button>
            <button class="btn btn-danger btn-block" onclick="deleteProduct('${p.code}')">Delete</button>
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
          <img src="${p.image}" alt="${p.name}" />
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
      showNotification("Cannot add more than available stock!", "error");
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
      showNotification("Cannot add more than available stock!", "error");
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
          <button class="btn btn-warning btn-qty" onclick="updateCartQty('${item.code}', -1)">-</button>
          <span>${item.qty}</span>
          <button class="btn btn-success btn-qty" onclick="updateCartQty('${item.code}', 1)">+</button>
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
    showNotification("Please load a customer account first!", "error");
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
    showNotification("Customer doesn't have enough balance!", "error");
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

  showNotification("Purchase successful!", "success");
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
        <td><button class="btn btn-danger" onclick="deleteHistoryEntry(${index})">Delete</button></td>
      </tr>
    `;
  });
}

function deleteHistoryEntry(index) {
  if (confirm("Delete this transaction record from history?")) {
    history.splice(index, 1);
    saveData(DB_HISTORY, history);
    renderHistoryTable();
    showNotification("History entry deleted", "warning");
  }
}

function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}
