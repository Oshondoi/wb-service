# Product Cost Management Module

## Overview (Added: Jan 14, 2026)
Модуль учёта себестоимости товаров для расчёта маржинальности продаж.

## Features
- ✅ Автоматическая загрузка товаров при открытии модалки
- ✅ Фотографии товаров из WB CDN (50×50px)
- ✅ Редактируемые поля: пользовательское название + себестоимость
- ✅ Умная кнопка сохранения (активируется при изменениях)
- ✅ Хранение в БД с привязкой к компании

## Database Schema

### Table: `product_costs`
```sql
CREATE TABLE product_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  nm_id TEXT NOT NULL,
  brand TEXT,
  custom_name TEXT,           -- NEW: User-defined product name
  cost REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  UNIQUE(business_id, nm_id)
);
```

### Migration
```javascript
function migrateAddCustomName() {
  const columns = db.prepare("PRAGMA table_info(product_costs)").all();
  const hasCustomName = columns.some(col => col.name === 'custom_name');
  
  if (!hasCustomName) {
    db.exec('ALTER TABLE product_costs ADD COLUMN custom_name TEXT');
  }
}
```
- Автоматически выполняется при старте сервера
- Безопасна для повторного запуска (проверяет наличие колонки)

## API Endpoints

### GET `/api/product-costs/:businessId`
Возвращает все себестоимости для компании.

**Response:**
```json
{
  "success": true,
  "costs": [
    {
      "id": 1,
      "business_id": 1,
      "nm_id": "158664781",
      "brand": "SS E",
      "custom_name": "Весы кухонные",
      "cost": 1800.00,
      "created_at": "2026-01-14 10:30:00",
      "updated_at": "2026-01-14 10:30:00"
    }
  ]
}
```

### POST `/api/product-costs/:businessId/bulk`
Массовое сохранение себестоимостей.

**Request:**
```json
{
  "products": [
    {
      "nmId": "158664781",
      "brand": "SS E",
      "customName": "Весы кухонные",
      "cost": 1800
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "count": 1,
  "message": "Сохранено 1 позиций"
}
```

## Frontend Implementation

### Modal Structure
```html
<div id="costModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h2>💰 Себестоимость товаров</h2>
      <button class="close-btn" onclick="closeCostModal()">&times;</button>
    </div>
    
    <div style="padding:0 20px 15px;border-bottom:1px solid #dfe6e9">
      <button id="saveCostBtn" onclick="saveCostData()" disabled 
        style="background:#b2bec3;cursor:not-allowed">
        💾 Сохранить
      </button>
    </div>
    
    <div id="costTableContainer" style="overflow:auto;padding:20px">
      <!-- Table rendered by renderCostTable() -->
    </div>
  </div>
</div>
```

### Table Columns
1. **Фото** (80px) - Миниатюра товара
2. **Бренд** (12%) - Из WB API
3. **Артикул WB** (12%) - nmId
4. **Название товара** (35%) - Редактируемый input
5. **Себестоимость (₽)** (25%) - Редактируемый number input

### Key Functions

#### `openCostModal()`
```javascript
function openCostModal() {
  if (!currentBusinessId) {
    alert('❌ Сначала выберите компанию');
    return;
  }
  document.getElementById('costModal').classList.add('active');
  loadCostData(); // Auto-load products
}
```

#### `loadCostData()`
1. Показывает "⏳ Загрузка товаров..."
2. Запрашивает `/api/wb-sales-grouped` для получения списка товаров
3. Формирует `costDataCache` с полями: `nmId`, `brand`, `customName`, `cost`
4. Вызывает `loadSavedCosts()` для загрузки сохранённых данных

#### `loadSavedCosts()`
1. Запрашивает `/api/product-costs/:businessId`
2. Обновляет `costDataCache` сохранёнными значениями `cost` и `customName`
3. Вызывает `renderCostTable()`

#### `renderCostTable()`
Генерирует HTML таблицы с:
- Изображениями через `getProductImageUrl(nmId)`
- Полями `<input type="text">` для customName
- Полями `<input type="number">` для cost
- Обработчиками `oninput="updateCostField(index, field, value)"`

#### `getProductImageUrl(nmId)`
```javascript
function getProductImageUrl(nmId) {
  const vol = Math.floor(nmId / 100000);
  const part = Math.floor(nmId / 1000);
  
  // Determine host (basket-01 to basket-14) based on vol
  let host;
  if (vol >= 0 && vol <= 143) host = '01';
  else if (vol >= 144 && vol <= 287) host = '02';
  // ... (up to basket-14)
  
  return `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/big/1.webp`;
}
```

**Image Fallback:**
```html
<img src="${imageUrl}" onerror="this.src='data:image/svg+xml,...📦...'" />
```
- При ошибке загрузки показывается SVG с иконкой 📦

#### `updateCostField(index, field, value)`
```javascript
function updateCostField(index, field, value) {
  if (costDataCache[index]) {
    if (field === 'cost') {
      costDataCache[index].cost = parseFloat(value) || 0;
    } else if (field === 'customName') {
      costDataCache[index].customName = value;
    }
    
    // Activate save button
    const saveBtn = document.getElementById('saveCostBtn');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.style.background = '#6c5ce7'; // Purple
      saveBtn.style.cursor = 'pointer';
    }
  }
}
```

#### `saveCostData()`
1. Проверяет наличие данных и `currentBusinessId`
2. Отправляет `POST /api/product-costs/:businessId/bulk` с `costDataCache`
3. При успехе:
   - Показывает alert с количеством сохранённых позиций
   - Деактивирует кнопку (серая, disabled)
4. При ошибке показывает alert с текстом ошибки

## Usage Flow

1. **User opens modal** → Click "💰 Себестоимость" button
2. **Auto-load** → Products from current date range loaded automatically
3. **Display** → Table shows photos, brands, nmIds, empty name/cost fields
4. **Saved data** → Previously saved custom names and costs loaded from DB
5. **Edit** → User types custom names and costs → Save button activates (purple)
6. **Save** → Click "💾 Сохранить" → Data saved to DB → Button deactivates (gray)
7. **Re-open** → Saved data automatically loaded next time

## WB Image CDN Details

### URL Structure
```
https://basket-{HOST}.wbbasket.ru/vol{VOL}/part{PART}/{NMID}/images/big/1.webp
```

### Host Mapping (by vol)
| vol Range | host |
|-----------|------|
| 0-143 | 01 |
| 144-287 | 02 |
| 288-431 | 03 |
| 432-719 | 04 |
| 720-1007 | 05 |
| 1008-1061 | 06 |
| 1062-1115 | 07 |
| 1116-1169 | 08 |
| 1170-1313 | 09 |
| 1314-1601 | 10 |
| 1602-1655 | 11 |
| 1656-1919 | 12 |
| 1920-2045 | 13 |
| 2046+ | 14 |

### Calculation
```javascript
const nmId = 158664781;
const vol = Math.floor(nmId / 100000);  // 1586
const part = Math.floor(nmId / 1000);   // 158664

// vol=1586 → host='12' (range 1656-1919)
// URL: https://basket-12.wbbasket.ru/vol1586/part158664/158664781/images/big/1.webp
```

## UI State Management

### Global Variables
```javascript
let costDataCache = [];       // Array of { nmId, brand, customName, cost }
let currentBusinessId = null; // Selected business ID
```

### Button States
```javascript
// Initial state (disabled)
<button id="saveCostBtn" disabled 
  style="background:#b2bec3;cursor:not-allowed">
  💾 Сохранить
</button>

// Active state (after input)
style="background:#6c5ce7;cursor:pointer"
disabled = false

// After successful save (back to disabled)
style="background:#b2bec3;cursor:not-allowed"
disabled = true
```

## Error Handling

### Image Load Errors
- SVG fallback with 📦 emoji
- Size: 50×50px to match table design
- Inline data URI for instant display

### API Errors
- Alert with descriptive error message
- Console logging for debugging
- Button state preserved (can retry)

### Validation
- Check for empty `costDataCache` before save
- Check for valid `currentBusinessId`
- Parse numeric values with fallback to 0

## Performance Considerations

### Image Loading
- Parallel loading (browser handles concurrency)
- Lazy loading could be added for large product lists
- CDN caching on WB side

### Data Caching
- `costDataCache` stored in memory (session-scoped)
- No localStorage persistence (security consideration)
- Re-fetched on each modal open (ensures fresh product list)

### Database
- Bulk upsert via transaction for speed
- UNIQUE constraint prevents duplicates
- CASCADE DELETE maintains referential integrity

## Future Enhancements (TODO)
- [ ] Batch edit functionality (set cost for multiple products)
- [ ] Import from Excel/CSV
- [ ] Export to Excel
- [ ] Cost history tracking (price changes over time)
- [ ] Automatic margin calculation in sales report
- [ ] Search/filter products in cost table
- [ ] Pagination for large product lists (>100 items)
- [ ] Image zoom on hover/click
