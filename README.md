# Company Bot MVP

Bot automation chạy local trên Windows. Giao diện nhận các câu lệnh tiếng Việt đơn giản, chuyển thành action có cấu trúc và điều khiển Microsoft Edge bằng Playwright.

## Cài và chạy

```powershell
cd D:\analyst\analyst\company-bot
npm install
npm start
```

Mở `http://127.0.0.1:4317`.

## Cấu hình quyền

Sửa `config/policy.json` trước khi dùng với website công ty. Thêm chính xác domain nội bộ vào `allowedDomains`, ví dụ:

```json
"allowedDomains": [
  "mes.company.local",
  "analyst.company.local"
]
```

Upload chỉ đọc file trong `allowedUploadFolders`. File tải về được lưu ở `runtime/downloads`.

## Lệnh MVP

```text
mở https://mes.company.local
bấm "Production"
nhập "SC5T" vào "Line"
chọn "Today" ở "Date"
tải file khi bấm "Export"
chờ "Completed"
chụp ảnh
```

Upload file:

```text
upload "D:\analyst\analyst\company-bot\runtime\uploads\result.xlsx" vào "input[type=file]"
```

## Tự chạy khi đăng nhập Windows

Sau khi test ổn, mở PowerShell và chạy:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-startup-task.ps1
```

Scheduled Task chạy trong phiên người dùng nên Edge có thể hiển thị và thao tác bình thường.

## Điều khiển qua Cloudflare

Cloudflare Worker public nằm trong `cloudflare/`. Windows agent kết nối outbound HTTPS tới Cloudflare, lấy task và chạy Edge tại máy Windows.

Chạy agent:

```powershell
npm run agent
```

Tự chạy cloud agent khi đăng nhập:

```powershell
powershell -ExecutionPolicy Bypass -File .\\scripts\\install-cloud-agent-task.ps1
```

Thông tin kết nối agent nằm trong `.env.agent` và không được commit vào Git.

## Phạm vi bản đầu

Planner hiện là deterministic parser để dễ kiểm soát. Bước tiếp theo có thể thêm planner AI cho câu lệnh tự nhiên hơn, nhưng executor vẫn chỉ nhận các action trong danh sách cho phép; AI không được chạy shell hoặc đọc file ngoài policy.
