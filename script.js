"use strict";

const BILLS_KEY = "karthikChickenCentre.pos.bills";
const SEQUENCE_KEY = "karthikChickenCentre.pos.nextBillNumber";
const UPI_ID = "9182496470-3@ybl";
const UPI_NAME = "YAMARAJULA VISHNU KRANTHI";
const SHOP_NAME = "Karthik Chicken Centre";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const categoryData = {
    meat: {
        paperRate: 287,
        minus: 30,
        finalRate: 257,
        quantity: 65,
        birdCount: 0
    },
    live: {
        paperRate: 0,
        minus: 0,
        finalRate: 0,
        quantity: 0,
        birdCount: 0
    }
};

let bills = [];
let activeCategory = "meat";
let currentBillId = "";
let currentBillSaved = false;
let modalBill = null;
let homeReceipt = null;


function showToast(message, isError = false) {
    const region = $("#toastRegion");
    const toast = document.createElement("div");
    toast.className = isError ? "toast error" : "toast";
    toast.textContent = message;
    region.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3800);
}


function todayISO(daysAgo = 0) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - daysAgo);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
}


function formatCurrency(value) {
    return "₹" + new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}


function formatNumber(value, digits = 2) {
    return new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits
    }).format(Number(value) || 0);
}


function formatDate(value) {
    if (!value) return "—";
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
}


function calculateTotal(finalRate, quantity) {
    return Math.round((Number(finalRate) * Number(quantity) + Number.EPSILON) * 100) / 100;
}


function makeSampleBills() {
    const year = new Date().getFullYear();
    const sample = [
        {
            customerName: "Pradeep Reddy",
            category: "meat",
            date: todayISO(0),
            paperRate: 287,
            minus: 30,
            finalRate: 257,
            quantity: 65,
            birdCount: 0
        },
        {
            customerName: "Ramesh Kumar",
            category: "live",
            date: todayISO(1),
            paperRate: 260,
            minus: 10,
            finalRate: 250,
            quantity: 42.5,
            birdCount: 8
        },
        {
            customerName: "Sowmya Devi",
            category: "meat",
            date: todayISO(2),
            paperRate: 320,
            minus: 20,
            finalRate: 300,
            quantity: 4.5,
            birdCount: 0
        },
        {
            customerName: "Ravi Teja",
            category: "live",
            date: todayISO(3),
            paperRate: 275,
            minus: 15,
            finalRate: 260,
            quantity: 28,
            birdCount: 5
        }
    ];

    return sample.map((bill, index) => ({
        ...bill,
        id: `KCC-${year}-${String(index + 1).padStart(4, "0")}`,
        total: calculateTotal(bill.finalRate, bill.quantity),
        createdAt: new Date(new Date(`${bill.date}T12:00:00`).getTime() - index * 60000).toISOString()
    }));
}


function loadBills() {
    let storedBills;

    try {
        storedBills = localStorage.getItem(BILLS_KEY);
    } catch (error) {
        console.error("Unable to read bill history from browser storage.", error);
        bills = makeSampleBills();
        showToast("Bill history storage is unavailable. Bills will only be kept for this session.", true);
        return;
    }

    if (storedBills === null) {
        bills = makeSampleBills();
        persistBills();

        try {
            localStorage.setItem(SEQUENCE_KEY, String(bills.length + 1));
        } catch (error) {
            console.error("Unable to initialize the bill number sequence.", error);
            showToast("Bill numbering could not be saved in this browser.", true);
        }
        return;
    }

    try {
        const parsedBills = JSON.parse(storedBills);
        if (!Array.isArray(parsedBills)) {
            throw new Error("Saved bill history is not a list.");
        }
        bills = parsedBills;
    } catch (error) {
        console.error("Unable to parse saved bill history.", error);
        bills = [];
        showToast("Saved bill history could not be read. Start with a new bill or clear browser storage.", true);
    }
}


function persistBills() {
    try {
        localStorage.setItem(BILLS_KEY, JSON.stringify(bills));
        return true;
    } catch (error) {
        console.error("Unable to save bill history.", error);
        showToast("Could not save this bill to browser storage.", true);
        return false;
    }
}


function reserveBillId() {
    const year = new Date().getFullYear();
    let sequence;

    try {
        const savedSequence = localStorage.getItem(SEQUENCE_KEY);
        sequence = savedSequence === null ? bills.length + 1 : Number(savedSequence);
        if (!Number.isSafeInteger(sequence) || sequence < 1) {
            throw new Error("Saved bill number sequence is invalid.");
        }
        localStorage.setItem(SEQUENCE_KEY, String(sequence + 1));
        return `KCC-${year}-${String(sequence).padStart(4, "0")}`;
    } catch (error) {
        console.error("Unable to persist the bill number sequence.", error);
        showToast("Browser storage is unavailable. A time-based bill ID was assigned.", true);
        return `KCC-${year}-${Date.now()}`;
    }
}


function numberFromInput(id) {
    const value = Number.parseFloat($("#" + id).value);
    return Number.isFinite(value) ? value : 0;
}


function currentData() {
    return categoryData[activeCategory];
}


function markDraftChanged() {
    if (currentBillSaved) {
        currentBillId = reserveBillId();
        currentBillSaved = false;
    }
}


function buildCurrentBill(id = currentBillId) {
    const item = currentData();
    const quantity = activeCategory === "meat" ? item.quantity : item.quantity;

    return {
        id,
        customerName: $("#customerName").value.trim() || "Walk-in Customer",
        date: $("#billDate").value || todayISO(),
        category: activeCategory,
        paperRate: Number(item.paperRate) || 0,
        minus: Number(item.minus) || 0,
        finalRate: Number(item.finalRate) || 0,
        quantity: Number(quantity) || 0,
        birdCount: activeCategory === "live" ? Number(item.birdCount) || 0 : 0,
        total: calculateTotal(item.finalRate, quantity),
        createdAt: new Date().toISOString()
    };
}


function makeTableRow(description, rate, className = "") {
    const row = document.createElement("tr");
    const descriptionCell = document.createElement("td");
    const rateCell = document.createElement("td");
    descriptionCell.textContent = description;
    rateCell.textContent = rate;
    if (className) row.className = className;
    row.append(descriptionCell, rateCell);
    return row;
}


function buildPaymentLink(total) {
    const params = new URLSearchParams({
        pa: UPI_ID,
        pn: UPI_NAME,
        am: Number(total).toFixed(2),
        cu: "INR",
        tn: `${SHOP_NAME} Bill`
    });
    return "upi://pay?" + params.toString();
}


function renderReceipt(receipt, bill) {
    receipt.dataset.billId = bill.id;
    $("[data-field='customer']", receipt).textContent = bill.customerName || "Walk-in Customer";
    $("[data-field='date']", receipt).textContent = formatDate(bill.date);
    $("[data-field='category']", receipt).textContent =
        bill.category === "live" ? "Live Hen Section" : "Meat Section";
    $("[data-field='billId']", receipt).textContent = bill.id;
    $("[data-field='total']", receipt).textContent = formatCurrency(bill.total);
    $("[data-field='payAmount']", receipt).textContent = formatCurrency(bill.total);

    const rows = $("[data-field='items']", receipt);
    rows.replaceChildren();
    rows.append(
        makeTableRow("Paper rate", formatNumber(bill.paperRate)),
        makeTableRow("Minus", formatNumber(bill.minus)),
        makeTableRow("Final rate", formatNumber(bill.finalRate), "final-row")
    );

    if (bill.category === "live") {
        rows.append(
            makeTableRow("Number of Birds", formatNumber(bill.birdCount, 0)),
            makeTableRow("Total Weight", formatNumber(bill.quantity, 3) + " kg")
        );
    } else {
        rows.append(makeTableRow("Quantity", formatNumber(bill.quantity, 3) + " kg"));
    }

    const payLink = $("[data-field='payLink']", receipt);
    payLink.href = buildPaymentLink(bill.total);
    payLink.setAttribute("aria-label", `Pay ${formatCurrency(bill.total)} with PhonePe`);

    const qr = $("[data-field='qr']", receipt);
    qr.replaceChildren();
    if (!(bill.total > 0)) {
        qr.textContent = "Enter an amount";
        return;
    }
    if (typeof QRCode === "undefined") {
        qr.textContent = "QR library unavailable";
        showToast("QR code library did not load. Check your internet connection.", true);
        return;
    }

    new QRCode(qr, {
        text: buildPaymentLink(bill.total),
        width: 250,
        height: 250,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
    });
}


function renderDraft() {
    const data = currentData();
    const total = calculateTotal(data.finalRate, data.quantity);
    $("#draftBillId").textContent = currentBillId;
    $("#draftTotal").textContent = formatCurrency(total);
    $("#previewCategoryBadge").textContent =
        activeCategory === "live" ? "Category: Live Hen" : "Category: Meat";

    renderReceipt(homeReceipt, buildCurrentBill());
}


function renderHistory() {
    const totalWeight = bills.reduce((sum, bill) => sum + (Number(bill.quantity) || 0), 0);
    const meatSales = bills
        .filter(bill => bill.category === "meat")
        .reduce((sum, bill) => sum + (Number(bill.total) || 0), 0);
    const liveSales = bills
        .filter(bill => bill.category === "live")
        .reduce((sum, bill) => sum + (Number(bill.total) || 0), 0);

    $("#historyBillCount").textContent = String(bills.length);
    $("#historyWeight").textContent = formatNumber(totalWeight, 3) + " kg";
    $("#historyMeatSales").textContent = formatCurrency(meatSales);
    $("#historyLiveSales").textContent = formatCurrency(liveSales);

    const search = $("#historySearch").value.trim().toLowerCase();
    const category = $("#categoryFilter").value;
    const date = $("#historyDateFilter").value;
    const filteredBills = bills.filter(bill => {
        const matchesSearch = !search ||
            bill.customerName.toLowerCase().includes(search) ||
            bill.id.toLowerCase().includes(search);
        const matchesCategory = category === "all" || bill.category === category;
        const matchesDate = !date || bill.date === date;
        return matchesSearch && matchesCategory && matchesDate;
    });

    const rows = $("#historyRows");
    rows.replaceChildren();

    filteredBills.forEach(bill => {
        const row = document.createElement("tr");
        const values = [
            bill.id,
            formatDate(bill.date),
            bill.customerName,
            bill.category === "live" ? "Live Hen" : "Meat",
            formatCurrency(bill.paperRate),
            formatCurrency(bill.minus),
            formatCurrency(bill.finalRate),
            bill.category === "live"
                ? `${formatNumber(bill.quantity, 3)} kg (${formatNumber(bill.birdCount, 0)} birds)`
                : `${formatNumber(bill.quantity, 3)} kg`,
            formatCurrency(bill.total)
        ];

        values.forEach((value, index) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            if (index === 3) {
                const categoryPill = document.createElement("span");
                categoryPill.className = bill.category === "live" ? "section-pill live" : "section-pill";
                categoryPill.textContent = value;
                cell.replaceChildren(categoryPill);
            } else if (index === 8) {
                cell.className = "history-total";
            }
            row.appendChild(cell);
        });

        const actions = document.createElement("td");
        const actionGroup = document.createElement("div");
        actionGroup.className = "row-actions";

        const viewButton = document.createElement("button");
        viewButton.className = "row-action";
        viewButton.type = "button";
        viewButton.dataset.action = "view";
        viewButton.dataset.billId = bill.id;
        viewButton.textContent = "View";

        const deleteButton = document.createElement("button");
        deleteButton.className = "row-action delete";
        deleteButton.type = "button";
        deleteButton.dataset.action = "delete";
        deleteButton.dataset.billId = bill.id;
        deleteButton.textContent = "Delete";

        actionGroup.append(viewButton, deleteButton);
        actions.appendChild(actionGroup);
        row.appendChild(actions);
        rows.appendChild(row);
    });

    $("#emptyHistory").hidden = filteredBills.length !== 0;
}


function syncCategoryInputs(category) {
    const data = categoryData[category];
    const prefix = category === "meat" ? "meat" : "live";
    data.paperRate = numberFromInput(prefix + "PaperRate");
    data.minus = numberFromInput(prefix + "Minus");
    data.finalRate = numberFromInput(prefix + "FinalRate");
    if (category === "meat") {
        data.quantity = numberFromInput("meatQuantity");
        data.birdCount = 0;
    } else {
        data.quantity = numberFromInput("liveWeight");
        data.birdCount = numberFromInput("liveBirds");
    }
}


function deriveFinalRate(category) {
    const data = categoryData[category];
    data.finalRate = Math.round((data.paperRate - data.minus) * 100) / 100;
    const field = $("#" + (category === "meat" ? "meatFinalRate" : "liveFinalRate"));
    field.value = String(data.finalRate);
}


function renderCategory() {
    $$(".category-tab").forEach(tab => {
        const selected = tab.dataset.category === activeCategory;
        tab.classList.toggle("active", selected);
        tab.setAttribute("aria-selected", String(selected));
    });
    $("#meatFields").hidden = activeCategory !== "meat";
    $("#liveFields").hidden = activeCategory !== "live";
}


function switchPage(pageName) {
    const page = pageName === "history" ? "history" : "home";
    $("#homePage").classList.toggle("active", page === "home");
    $("#homePage").hidden = page !== "home";
    $("#historyPage").classList.toggle("active", page === "history");
    $("#historyPage").hidden = page !== "history";
    $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.page === page));
    if (page === "history") renderHistory();
}


function generateBill() {
    if (currentBillSaved) {
        showToast("This bill is already in history. Change the details or reset for a new bill.");
        return;
    }

    const bill = buildCurrentBill();
    if (!bill.customerName || bill.customerName === "Walk-in Customer") {
        showToast("Enter the customer name before generating the bill.", true);
        $("#customerName").focus();
        return;
    }
    if (!(bill.quantity > 0) || !(bill.total > 0)) {
        showToast("Enter a positive quantity and total amount before generating the bill.", true);
        return;
    }

    if (bills.some(savedBill => savedBill.id === bill.id)) {
        currentBillId = reserveBillId();
        bill.id = currentBillId;
    }

    bill.createdAt = new Date().toISOString();
    bills.unshift(bill);
    if (!persistBills()) {
        bills = bills.filter(savedBill => savedBill.id !== bill.id);
        return;
    }

    currentBillSaved = true;
    renderDraft();
    renderHistory();
    showToast(`Bill ${bill.id} saved successfully.`);
}


function resetForm() {
    $("#customerName").value = "";
    $("#billDate").value = todayISO();
    categoryData.meat = { paperRate: 0, minus: 0, finalRate: 0, quantity: 0, birdCount: 0 };
    categoryData.live = { paperRate: 0, minus: 0, finalRate: 0, quantity: 0, birdCount: 0 };
    $("#meatPaperRate").value = "0";
    $("#meatMinus").value = "0";
    $("#meatFinalRate").value = "0";
    $("#meatQuantity").value = "0";
    $("#livePaperRate").value = "0";
    $("#liveMinus").value = "0";
    $("#liveFinalRate").value = "0";
    $("#liveBirds").value = "0";
    $("#liveWeight").value = "0";
    activeCategory = "meat";
    currentBillId = reserveBillId();
    currentBillSaved = false;
    renderCategory();
    renderDraft();
    showToast("Ready for the next customer.");
}


function downloadReceipt(receipt, bill) {
    if (typeof html2canvas === "undefined") {
        showToast("Download library did not load. Check your internet connection.", true);
        return;
    }

    const button = receipt.closest("#homeReceiptMount")
        ? $("#downloadButton")
        : $("#modalDownloadButton");
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing…";
    receipt.classList.add("a5-output");

    return new Promise(resolve => {
        window.setTimeout(resolve, 350);
    }).then(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    })).then(() => html2canvas(receipt, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false
    })).then(canvas => {
        const link = document.createElement("a");
        link.download = `Karthik_Chicken_Centre_${bill.id}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        showToast(`Downloaded bill ${bill.id}.`);
    }).catch(error => {
        console.error("Unable to create the bill image.", error);
        showToast("Unable to download the bill. Please try again.", true);
    }).finally(() => {
        receipt.classList.remove("a5-output");
        button.disabled = false;
        button.textContent = originalText;
    });
}


function printReceipt(receipt) {
    $$(".receipt-card").forEach(card => card.classList.remove("print-target"));
    const originalParent = receipt.parentElement;
    if (!originalParent) return;

    const placeholder = document.createComment("receipt print position");
    originalParent.insertBefore(placeholder, receipt);
    const printRoot = document.createElement("div");
    printRoot.id = "printRoot";

    receipt.classList.add("print-target");
    printRoot.appendChild(receipt);
    document.body.appendChild(printRoot);
    document.body.classList.add("print-mode");

    window.addEventListener("afterprint", () => {
        if (placeholder.parentNode) placeholder.parentNode.insertBefore(receipt, placeholder);
        placeholder.remove();
        printRoot.remove();
        receipt.classList.remove("print-target");
        document.body.classList.remove("print-mode");
    }, { once: true });

    window.print();
}


function openBillModal(billId) {
    modalBill = bills.find(bill => bill.id === billId);
    if (!modalBill) {
        showToast("That bill could not be found in history.", true);
        return;
    }

    const mount = $("#modalReceiptMount");
    mount.replaceChildren();
    const receipt = createReceiptElement();
    renderReceipt(receipt, modalBill);
    mount.appendChild(receipt);
    $("#modalTitle").textContent = `Bill ${modalBill.id}`;
    $("#billModal").classList.add("open");
    $("#billModal").setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    $("#closeModalButton").focus();
}


function createReceiptElement() {
    const fragment = $("#receiptTemplate").content.cloneNode(true);
    return $(".receipt-card", fragment);
}


function closeBillModal() {
    $("#billModal").classList.remove("open");
    $("#billModal").setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    modalBill = null;
}


function bindEvents() {
    $$(".nav-link, .new-bill-button").forEach(button => {
        button.addEventListener("click", () => switchPage(button.dataset.page));
    });

    $$(".category-tab").forEach(button => {
        button.addEventListener("click", () => {
            const nextCategory = button.dataset.category;
            if (nextCategory === activeCategory) return;
            markDraftChanged();
            syncCategoryInputs(activeCategory);
            activeCategory = nextCategory;
            renderCategory();
            renderDraft();
        });
    });

    $("#customerName").addEventListener("input", () => {
        markDraftChanged();
        renderDraft();
    });
    $("#billDate").addEventListener("change", () => {
        markDraftChanged();
        renderDraft();
    });

    ["meat", "live"].forEach(category => {
        const prefix = category === "meat" ? "meat" : "live";
        ["PaperRate", "Minus"].forEach(field => {
            $("#" + prefix + field).addEventListener("input", () => {
                markDraftChanged();
                syncCategoryInputs(category);
                deriveFinalRate(category);
                if (activeCategory === category) renderDraft();
            });
        });

        $("#" + prefix + "FinalRate").addEventListener("input", () => {
            markDraftChanged();
            syncCategoryInputs(category);
            if (activeCategory === category) renderDraft();
        });
    });

    $("#meatQuantity").addEventListener("input", () => {
        markDraftChanged();
        syncCategoryInputs("meat");
        if (activeCategory === "meat") renderDraft();
    });
    $("#liveBirds").addEventListener("input", () => {
        markDraftChanged();
        syncCategoryInputs("live");
        if (activeCategory === "live") renderDraft();
    });
    $("#liveWeight").addEventListener("input", () => {
        markDraftChanged();
        syncCategoryInputs("live");
        if (activeCategory === "live") renderDraft();
    });

    $("#generateBillButton").addEventListener("click", generateBill);
    $("#logoutButton").addEventListener("click", async event => {
        const button = event.currentTarget;
        button.disabled = true;

        try {
            const response = await fetch("./api/auth/logout", {
                method: "POST",
                credentials: "same-origin"
            });
            if (!response.ok) throw new Error(`Logout failed with status ${response.status}.`);
            window.location.replace("./login.html");
        } catch (error) {
            console.error("Unable to end the admin session.", error);
            showToast("Unable to log out. Please try again.", true);
            button.disabled = false;
        }
    });

    $("#downloadButton").addEventListener("click", () => {
        downloadReceipt(homeReceipt, buildCurrentBill());
    });
    $("#printButton").addEventListener("click", () => printReceipt(homeReceipt));
    $("#resetButton").addEventListener("click", resetForm);

    $("#historySearch").addEventListener("input", renderHistory);
    $("#categoryFilter").addEventListener("change", renderHistory);
    $("#historyDateFilter").addEventListener("change", renderHistory);

    $("#historyRows").addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const billId = button.dataset.billId;

        if (button.dataset.action === "view") {
            openBillModal(billId);
            return;
        }

        const bill = bills.find(item => item.id === billId);
        if (!bill || !window.confirm(`Delete bill ${bill.id}? This cannot be undone.`)) return;
        bills = bills.filter(item => item.id !== billId);
        if (persistBills()) {
            renderHistory();
            showToast(`Bill ${billId} deleted.`);
        }
    });

    $("#closeModalButton").addEventListener("click", closeBillModal);
    $("#billModal").addEventListener("click", event => {
        if (event.target.matches("[data-close-modal]")) closeBillModal();
    });
    $("#modalDownloadButton").addEventListener("click", () => {
        const receipt = $(".receipt-card", $("#modalReceiptMount"));
        if (receipt && modalBill) downloadReceipt(receipt, modalBill);
    });
    $("#modalPrintButton").addEventListener("click", () => {
        const receipt = $(".receipt-card", $("#modalReceiptMount"));
        if (receipt) printReceipt(receipt);
    });
    window.addEventListener("keydown", event => {
        if (event.key === "Escape" && $("#billModal").classList.contains("open")) {
            closeBillModal();
        }
    });
}


function initialize() {
    loadBills();
    homeReceipt = createReceiptElement();
    $("#homeReceiptMount").appendChild(homeReceipt);
    $("#billDate").value = todayISO();
    currentBillId = reserveBillId();
    bindEvents();
    renderCategory();
    renderDraft();
    renderHistory();
}


initialize();
