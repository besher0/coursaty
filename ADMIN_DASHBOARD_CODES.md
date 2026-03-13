## Admin Dashboard - Discount Codes Feature

### Overview
تم إضافة نظام شامل لإدارة أكواد الخصم (Discount Codes) في لوحة تحكم الإدمن.

### New Endpoints

#### GET /admins/dashboard
Retrieve complete admin dashboard with metrics, codes statistics, and pending items.

**Query Parameters:**
- `codesPage` - Page number for codes listing (default: 1)
- `codesLimit` - Items per page for codes (default: 20, max: 50)
- `teachersPage` - Page number for pending teachers (default: 1)
- `teachersLimit` - Items per page for pending teachers (default: 20)
- `coursesPage` - Page number for pending courses (default: 1)
- `coursesLimit` - Items per page for pending courses (default: 20)
- `notificationsPage` - Page number for notifications (default: 1)
- `notificationsLimit` - Items per page for notifications (default: 20)

**Response Structure:**
```json
{
  "metrics": {
    "totalRevenue": 15000.50,
    "newStudentsThisMonth": 250,
    "totalVisitors": 5000,
    "activeCoursesCount": 45,
    "totalTeachersCount": 120,
    "pendingTeachersCount": 8,
    "newRequestsCount": 5
  },
  "codeStatistics": {
    "totalCodesCreated": 150,
    "activeCodesCount": 45,
    "usedCodesCount": 85,
    "inactiveCodesCount": 20,
    "totalDiscountValueApplied": 250.50,
    "totalRevenueFromCodes": 1250.75
  },
  "codesPagination": {
    "page": 1,
    "limit": 20,
    "total": 150
  },
  "codes": [
    {
      "id": 1,
      "codeValue": "WELCOME10",
      "status": "ACTIVE",
      "discountPercentage": 10.5,
      "usageCount": 5,
      "usageLimit": 10,
      "validUntil": "2026-03-10T00:00:00.000Z",
      "createdAt": "2026-02-01T00:00:00.000Z",
      "course": { "id": 1, "name": "Mathematics 101" },
      "codeGroup": { "id": 1, "batchName": "Batch 1" }
    }
  ],
  "pendingTeachersPagination": {...},
  "pendingTeachers": [...],
  "pendingCoursesPagination": {...},
  "pendingCourses": [...],
  "notificationsPagination": {...},
  "notifications": [...]
}
```

### Code Statistics Breakdown

**totalCodesCreated**
- Total number of discount codes in the system

**activeCodesCount**
- Number of codes with status = ACTIVE (not yet used and not expired)

**usedCodesCount**
- Number of codes with status = USED (already applied by students)

**inactiveCodesCount**
- Number of codes with status = INACTIVE (expired or manually disabled)

**totalDiscountValueApplied**
- Sum of actual discount amounts applied via codes in current month
- Formula: SUM(codeDiscountAmount) where createdAt is in current month

**totalRevenueFromCodes**
- Sum of final prices from subscriptions that used discount codes in current month
- Formula: SUM(finalPrice) where codeDiscountAmount > 0

### Files Created/Modified

1. **dtos/admin-dashboard.dto.ts** (NEW)
   - AdminDashboardDto - Main dashboard response
   - CodeDisplayDto - Discount code display information
   - CodeStatisticsDto - Code-related statistics
   - DashboardMetricsDto - Key business metrics
   - PaginationDto - Pagination metadata
   - AdminDashboardQueryDto - Query parameters

2. **services/admin-dashboard.service.ts** (NEW)
   - getDashboard() - Get complete dashboard
   - getDashboardMetrics() - Calculate key metrics
   - getCodeStatistics() - Discount codes statistics
   - getCodes(page, limit) - List all codes with pagination
   - getCodesByStatus(status, page, limit) - Filter codes by status
   - getPendingTeachers() - Teachers with pending courses
   - getPendingCourses() - Courses awaiting approval
   - getPendingNotifications() - Pending notifications

3. **controllers/admins.controller.ts** (MODIFIED)
   - Added GET /admins/dashboard endpoint
   - Added RolesGuard and JwtAuthGuard protection
   - Integrated AdminDashboardService

4. **admins.module.ts** (MODIFIED)
   - Added AdminDashboardService to providers

### Key Features

✅ **Code Tracking**
- Display all codes with their status (ACTIVE, USED, INACTIVE)
- Show discount percentage from associated CodeGroup
- Track usage count vs usage limit
- Display expiration date (validUntil)

✅ **Statistics**
- Monthly discount value applied
- Revenue generated from code-discounted subscriptions
- Code status distribution (active/used/inactive)

✅ **Pagination**
- Configurable page size (1-50 items per page)
- Safe pagination with bounds checking
- Separate pagination for each collection

✅ **Related Data**
- Course information linked to codes
- CodeGroup (batch) information
- Teacher and course pending approval counts
- Real-time notification status

### Example Usage

**Get dashboard with default pagination:**
```
GET /admins/dashboard
Authorization: Bearer {JWT_TOKEN}
```

**Get dashboard with custom code pagination:**
```
GET /admins/dashboard?codesPage=2&codesLimit=50&teachersPage=1
Authorization: Bearer {JWT_TOKEN}
```

**Response includes:**
- 50 discount codes on page 2
- Code statistics (active: 45, used: 85, inactive: 20)
- Total discount value applied this month
- Revenue from code-discounted subscriptions
- Pending teachers, courses, and notifications (default pagination)

### Discount Calculation with Codes

**Formula for subscriptions using codes:**
```
basePrice = course.price
courseDiscount = basePrice × courseDiscountPercentage / 100
priceAfterCourseDiscount = basePrice - courseDiscount
codeDiscount = priceAfterCourseDiscount × codeDiscountPercentage / 100
finalPrice = priceAfterCourseDiscount - codeDiscount
```

**All amounts tracked in StudentSubscription:**
- basePrice: Original course price
- courseDiscountAmount: Discount from course
- codeDiscountAmount: Discount from code (only if code used)
- finalPrice: Amount student actually pays
