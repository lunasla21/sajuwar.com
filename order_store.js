const fs = require("fs");
const path = require("path");

const ORDER_STATUS = {
  WAITING: "\uc785\uae08\ub300\uae30",
  CONFIRMED: "\ud655\uc778\uc644\ub8cc",
  CANCELED: "\ucde8\uc18c",
};

const PAYMENT_METHOD = {
  BANK_TRANSFER: "bank_transfer",
};

const PRODUCTS = {
  premium_report: {
    id: "premium_report",
    name: "\uc0ac\uc8fc\uc804\uc7c1 \ud504\ub9ac\ubbf8\uc5c4 \ub9ac\ud3ec\ud2b8",
    type: "report",
    amount: 9900,
    accessUrl: "/?paid=1",
  },
  compatibility_report: {
    id: "compatibility_report",
    name: "\uc720\ub8cc \uad81\ud569 \ub9ac\ud3ec\ud2b8",
    type: "report",
    amount: 9900,
    accessUrl: "/#compatibility-paid",
  },
  saju_lecture: {
    id: "saju_lecture",
    name: "\uc0ac\uc8fc\uc804\uc7c1 \uac15\uc758",
    type: "lecture",
    amount: 99000,
    accessUrl: "/lecture.html",
  },
};

function createOrderStore(baseDir) {
  const dataDir = process.env.SAJUWAR_DATA_DIR || path.join(baseDir, "data");
  const ordersPath = path.join(dataDir, "orders.json");
  const purchasesPath = path.join(dataDir, "purchases.json");

  function ensureJsonFile(filePath) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]", "utf8");
  }

  function readJson(filePath) {
    ensureJsonFile(filePath);
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeJson(filePath, items) {
    ensureJsonFile(filePath);
    fs.writeFileSync(filePath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  }

  function listOrders() {
    return readJson(ordersPath).sort((a, b) => new Date(b.ordered_at) - new Date(a.ordered_at));
  }

  function listPurchases() {
    return readJson(purchasesPath);
  }

  function writePurchases(purchases) {
    writeJson(purchasesPath, purchases);
  }

  function makeOrderId() {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);
    const random = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `SW${stamp}${random}`;
  }

  function normalizeUser(payload = {}) {
    const email = String(payload.email || "").trim().toLowerCase();
    const phone = String(payload.phone || "").trim();
    return {
      user_id: String(payload.user_id || email || phone || "").trim(),
      name: String(payload.name || "").trim(),
      email,
      phone,
    };
  }

  function makeError(message, status, extra = {}) {
    const error = new Error(message);
    error.status = status;
    Object.assign(error, extra);
    return error;
  }

  function createBankTransferOrder(payload = {}) {
    const product = PRODUCTS[payload.product_id];
    if (!product) throw makeError("Invalid product id", 400);

    const user = normalizeUser(payload);
    if (!user.user_id || !user.name || !user.email || !user.phone) {
      throw makeError("Login required", 401);
    }

    const amount = Number(payload.amount || product.amount);
    if (amount !== product.amount) throw makeError("Invalid product amount", 400);

    const duplicate = readJson(ordersPath).find((order) => {
      return (
        order.user_id === user.user_id &&
        order.product_id === product.id &&
        order.status !== ORDER_STATUS.CANCELED
      );
    });
    if (duplicate) {
      throw makeError(
        duplicate.status === ORDER_STATUS.CONFIRMED
          ? "Product already purchased"
          : "Order already waiting for deposit",
        409,
        { order: duplicate }
      );
    }

    const order = {
      id: makeOrderId(),
      user_id: user.user_id,
      user_name: user.name,
      email: user.email,
      phone: user.phone,
      product_id: product.id,
      product_name: product.name,
      product_type: product.type,
      amount,
      payment_method: PAYMENT_METHOD.BANK_TRANSFER,
      depositor_name: String(payload.depositor_name || user.name).trim(),
      application: String(payload.application || "").trim(),
      status: ORDER_STATUS.WAITING,
      ordered_at: new Date().toISOString(),
      deposit_marked_at: null,
      confirmed_at: null,
      canceled_at: null,
    };

    const orders = readJson(ordersPath);
    orders.push(order);
    writeJson(ordersPath, orders);
    return order;
  }

  function updateOrder(orderId, updater) {
    const orders = readJson(ordersPath);
    const index = orders.findIndex((order) => order.id === orderId);
    if (index === -1) return null;
    orders[index] = updater(orders[index]);
    writeJson(ordersPath, orders);
    return orders[index];
  }

  function findOrder(orderId) {
    return readJson(ordersPath).find((order) => order.id === orderId) || null;
  }

  function markDepositWaiting(orderId, depositorName, userId) {
    const order = findOrder(orderId);
    if (!order) return null;
    if (userId && order.user_id !== userId) throw makeError("Order owner mismatch", 403);
    if (order.status === ORDER_STATUS.CANCELED) throw makeError("Canceled order", 409);
    return updateOrder(orderId, (current) => ({
      ...current,
      depositor_name: String(depositorName || current.depositor_name || "").trim(),
      status: current.status === ORDER_STATUS.CONFIRMED ? ORDER_STATUS.CONFIRMED : ORDER_STATUS.WAITING,
      deposit_marked_at: current.deposit_marked_at || new Date().toISOString(),
    }));
  }

  function activatePurchase(order) {
    if (!order) throw makeError("order not found", 404);
    if (order.status === ORDER_STATUS.CANCELED) throw makeError("Canceled order cannot be confirmed", 409);

    const activatedAt = new Date().toISOString();
    const confirmedOrder = updateOrder(order.id, (current) => ({
      ...current,
      status: ORDER_STATUS.CONFIRMED,
      confirmed_at: current.confirmed_at || activatedAt,
    }));

    const purchases = readJson(purchasesPath);
    const existingIndex = purchases.findIndex(
      (purchase) => purchase.user_id === order.user_id && purchase.product_id === order.product_id
    );
    const purchase = {
      id: existingIndex >= 0 ? purchases[existingIndex].id : `PUR_${order.id}`,
      user_id: order.user_id,
      product_id: order.product_id,
      product_name: order.product_name,
      product_type: order.product_type,
      order_id: existingIndex >= 0 ? purchases[existingIndex].order_id : order.id,
      activated_at: existingIndex >= 0 ? purchases[existingIndex].activated_at : activatedAt,
    };

    if (existingIndex >= 0) purchases[existingIndex] = purchase;
    else purchases.push(purchase);
    writeJson(purchasesPath, purchases);
    return { order: confirmedOrder, purchase, duplicate: existingIndex >= 0 };
  }

  function revokePurchase(orderId) {
    const order = findOrder(orderId);
    if (!order) return null;
    if (order.status === ORDER_STATUS.CANCELED) throw makeError("Canceled order cannot be reverted", 409);

    const purchases = listPurchases();
    const purchase = purchases.find((item) => item.order_id === orderId);
    const nextPurchases = purchases.filter((item) => item.order_id !== orderId);
    writePurchases(nextPurchases);

    const revertedOrder = updateOrder(orderId, (current) => ({
      ...current,
      status: ORDER_STATUS.WAITING,
      confirmed_at: null,
    }));
    return { order: revertedOrder, removed_purchase: purchase || null };
  }

  function markPurchaseAccess({ user_id, product_id, access_type = "view" }) {
    const purchases = listPurchases();
    const index = purchases.findIndex(
      (purchase) => purchase.user_id === user_id && purchase.product_id === product_id
    );
    if (index === -1) return null;
    const now = new Date().toISOString();
    purchases[index] = {
      ...purchases[index],
      access_count: Number(purchases[index].access_count || 0) + 1,
      last_accessed_at: now,
      last_access_type: access_type,
    };
    writePurchases(purchases);
    return purchases[index];
  }

  function cancelOrder(orderId) {
    const order = findOrder(orderId);
    if (!order) return null;
    if (order.status === ORDER_STATUS.CONFIRMED) {
      throw makeError("Confirmed order cannot be canceled", 409);
    }
    return updateOrder(orderId, (current) => ({
      ...current,
      status: ORDER_STATUS.CANCELED,
      canceled_at: current.canceled_at || new Date().toISOString(),
    }));
  }

  function findUserOrders({ email, phone, user_id }) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPhone = String(phone || "").trim();
    const normalizedUserId = String(user_id || "").trim();
    return listOrders().filter((order) => {
      return (
        (normalizedUserId && order.user_id === normalizedUserId) ||
        (normalizedEmail && order.email === normalizedEmail) ||
        (normalizedPhone && order.phone === normalizedPhone)
      );
    });
  }

  function hasPurchase({ email, phone, user_id, product_id }) {
    const orders = findUserOrders({ email, phone, user_id });
    const purchases = listPurchases();
    return orders.some((order) => {
      return (
        order.product_id === product_id &&
        order.status === ORDER_STATUS.CONFIRMED &&
        purchases.some(
          (purchase) =>
            purchase.user_id === order.user_id &&
            purchase.product_id === order.product_id &&
            purchase.order_id === order.id
        )
      );
    });
  }

  return {
    ORDER_STATUS,
    PRODUCTS,
    activatePurchase,
    cancelOrder,
    createBankTransferOrder,
    findOrder,
    findUserOrders,
    hasPurchase,
    listOrders,
    listPurchases,
    markPurchaseAccess,
    markDepositWaiting,
    revokePurchase,
  };
}

module.exports = {
  ORDER_STATUS,
  PAYMENT_METHOD,
  PRODUCTS,
  createOrderStore,
};
