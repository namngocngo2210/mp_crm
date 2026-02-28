# MP CRM (Django + SQLAlchemy + React)

## Stack
- Backend: Django API + SQLAlchemy query layer + SQLite
- Frontend: React + TypeScript + lucide-react
- Auth: Token login

## Implemented Features
- Login API + login UI
- Tabs: `Khách hàng`, `Sản phẩm`, `Kế hoạch sản xuất`
- Products edit flow:
  - Product Specs
  - Print Images upload theo phiên bản tự tăng (`version_no = max + 1`)
- Datetime response format: `dd-mm-yyyy hh:mm:ss`

## Default Account
- Username: `admin`
- Password: `123456`

## Run Backend (Conda)
```bash
cd /home/namng/Desktop/workspace/mp_crm
conda create -y -n mp_crm python=3.11
conda activate mp_crm
pip install -r backend/requirements.txt
cd backend
python scripts/init_db.py
python manage.py runserver 0.0.0.0:8000
```

## Run Frontend
```bash
cd /home/namng/Desktop/workspace/mp_crm/frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`  
Backend URL: `http://localhost:8000`

## API Quick Check
```bash
curl -s http://localhost:8000/api/health
curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"123456"}'
```
