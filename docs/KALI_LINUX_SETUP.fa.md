# راه‌اندازی n8n و n8n-MCP روی Kali Linux

این راهنما n8n و سرور n8n-MCP را روی همان سیستم Kali Linux اجرا می‌کند. در این
چیدمان، ویرایشگر n8n فقط روی `127.0.0.1:5678` و MCP فقط روی
`127.0.0.1:3000` قابل دسترسی هستند؛ ارتباط داخلی دو کانتینر از شبکهٔ Docker
استفاده می‌کند. بنابراین لازم نیست پورت‌ها را در اینترنت باز کنید.

> این راهنما n8n-MCP را به **نمونهٔ n8n محلی** وصل می‌کند تا ابزارهای مدیریت
> گردش‌کار آن فعال شوند. برای اتصال به یک n8n راه‌دور، به‌جای این راهنما مقدار
> `N8N_API_URL` را روی نشانی HTTPS همان نمونه قرار دهید.

## ۱. پیش‌نیازها

در یک ترمینال Kali، Docker Engine و افزونهٔ Compose را نصب و سرویس آن را فعال
کنید:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin openssl
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

پس از اجرای دستور آخر، یک‌بار از نشست گرافیکی خارج و دوباره وارد شوید (یا
`newgrp docker` را اجرا کنید). سپس نصب را بررسی کنید:

```bash
docker --version
docker compose version
```

## ۲. دریافت پروژه و ساخت تنظیمات محرمانه

این مخزن را دریافت کنید و یک فایل محیطی محلی بسازید. فایل `.env.kali` را در
Git ثبت نکنید و مقادیر چاپ‌شده را در اختیار دیگران نگذارید.

```bash
git clone https://github.com/czlonkowski/n8n-mcp.git
cd n8n-mcp

MCP_TOKEN="$(openssl rand -hex 32)"
N8N_KEY="$(openssl rand -hex 32)"
N8N_PASSWORD="$(openssl rand -base64 24)"

cat > .env.kali <<EOF
N8N_BIND_ADDRESS=127.0.0.1
MCP_BIND_ADDRESS=127.0.0.1
N8N_PORT=5678
MCP_PORT=3000
N8N_HOST=localhost
N8N_PROTOCOL=http
N8N_WEBHOOK_URL=http://localhost:5678/
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
N8N_ENCRYPTION_KEY=${N8N_KEY}
MCP_AUTH_TOKEN=${MCP_TOKEN}
N8N_API_KEY=
LOG_LEVEL=info
EOF

chmod 600 .env.kali
```

> `N8N_ENCRYPTION_KEY` برای رمزگشایی اعتبارنامه‌های n8n حیاتی است. پس از ایجاد
> آن را تغییر ندهید و یک نسخهٔ پشتیبان امن از آن نگه دارید.

## ۳. اجرای n8n و ساخت API key

ابتدا فقط n8n را اجرا کنید:

```bash
docker compose --env-file .env.kali -f docker-compose.n8n.yml up -d n8n
docker compose --env-file .env.kali -f docker-compose.n8n.yml ps
until curl --silent --fail http://127.0.0.1:5678/healthz; do sleep 2; done
```

سپس در مرورگر همان سیستم، `http://127.0.0.1:5678` را باز کنید و حساب مالک را
ایجاد کنید. از **Settings → API** یک API key جدید بسازید و آن را در خط
`N8N_API_KEY=` فایل `.env.kali` قرار دهید. این کلید، دسترسی n8n-MCP به API
مدیریت گردش‌کارها را فراهم می‌کند.

معتبر بودن کلید را، بدون نمایش آن در تاریخچهٔ shell، این‌طور بررسی کنید:

```bash
read -rsp 'n8n API key: ' N8N_API_KEY; echo
curl --fail \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  http://127.0.0.1:5678/api/v1/workflows
unset N8N_API_KEY
```

## ۴. اتصال n8n-MCP

پس از ذخیرهٔ API key در `.env.kali`، سرویس MCP را بسازید و اجرا کنید:

```bash
docker compose --env-file .env.kali -f docker-compose.n8n.yml up -d --build n8n-mcp
docker compose --env-file .env.kali -f docker-compose.n8n.yml ps
until curl --silent --fail http://127.0.0.1:3000/health; do sleep 2; done
```

در یک گردش‌کار n8n، گره **MCP Client Tool** را اضافه کنید و این مقادیر را وارد
کنید:

| فیلد | مقدار |
| --- | --- |
| Server URL | `http://n8n-mcp:3000/mcp` |
| Authentication | Bearer token |
| Token | مقدار `MCP_AUTH_TOKEN` در `.env.kali` |

از نشانی `http://localhost:3000/mcp` در گرهٔ داخل کانتینر n8n استفاده نکنید؛
`localhost` در آنجا به خود کانتینر n8n اشاره می‌کند. نام سرویس `n8n-mcp` روی
شبکهٔ Compose به مقصد درست resolve می‌شود.

## نگهداری و عیب‌یابی

```bash
# مشاهدهٔ لاگ‌های هر دو سرویس
docker compose --env-file .env.kali -f docker-compose.n8n.yml logs -f n8n n8n-mcp

# توقف سرویس‌ها، بدون پاک کردن داده‌ها
docker compose --env-file .env.kali -f docker-compose.n8n.yml down

# به‌روزرسانی و اجرای مجدد
git pull --ff-only
docker compose --env-file .env.kali -f docker-compose.n8n.yml up -d --build
```

اگر لازم است رابط n8n یا MCP از دستگاه دیگری در شبکهٔ محلی قابل دسترسی باشد،
پیش از اجرا `N8N_BIND_ADDRESS=0.0.0.0` یا `MCP_BIND_ADDRESS=0.0.0.0` را تنظیم
کنید. این کار را فقط همراه با فایروال و، برای دسترسی بیرونی، reverse proxy با
HTTPS انجام دهید.
