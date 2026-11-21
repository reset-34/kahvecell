# KahveCell

KahveCell, kahve aboneliği satın alma, yakındaki kahvecileri haritada bulma ve QR kodla sipariş teslim alma akışlarını bir araya getiren bir case-study uygulamasıdır. Backend FastAPI ve SQLite, arayüz React ve TypeScript, harita Leaflet, tüm uygulamayı çalıştırma yöntemi Docker Compose'tur.

> Bu proje eğitim ve demo amaçlıdır. OTP ve ödeme akışları simülasyondur; gerçek SMS veya ödeme işlemi yapılmaz. Canlıya almadan önce güvenlik, ödeme sağlayıcısı, yedekleme ve dağıtım ayarları ayrıca ele alınmalıdır.

## Uygulama neler yapıyor?

- Telefon numarası ve şifreyle kayıt/giriş; test OTP kodu `1234`.
- Dükkânları listeleme, ada/adrese göre arama, konum ve mesafeye göre sıralama.
- Leaflet haritasında dükkânları gösterme ve menü/ürün detaylarını açma.
- Starter, Premium ve Unlimited aboneliklerini listeleme; test kartıyla simüle ödeme, paket değiştirme ve iptal.
- Aktif abonelik ve kredi hakkı kontrolünden sonra sipariş oluşturma.
- Siparişe özel, imzalı QR kod üretme ve dükkân tarafında QR doğrulama.
- Müşterinin sipariş geçmişini ve dükkân sahibinin sipariş kuyruğunu gösterme.
- Sipariş durumu değişikliklerini QR ekranına SSE (Server-Sent Events) ile anlık iletme.
- Sayfalarda yükleniyor, hata/tekrar dene ve boş liste durumlarını gösterme.

## Nasıl geliştirildi?

Uygulama, case dokümanındaki kullanıcı akışlarını küçük ve test edilebilir parçalara ayırarak kuruldu:

1. **Backend temeli:** FastAPI uygulaması, SQLite bağlantısı ve uygulama başladığında tabloları hazırlayan şema kuruldu.
2. **Hesaplar ve yetkiler:** Kayıt, simüle OTP doğrulama, giriş, access/refresh token ve müşteri/dükkân sahibi rolleri eklendi.
3. **Dükkân keşfi:** Dükkân ve ürün endpoint'leri, arama/mesafe hesabı, Ankara örnek verisi ve Leaflet haritası hazırlandı.
4. **Abonelik ve ödeme:** Paket listeleme, simüle ödeme, abonelik başlatma/yükseltme/düşürme/iptal ve ödeme geçmişi eklendi.
5. **Sipariş ve QR:** Sipariş oluştururken abonelik/kredi kontrolü yapıldı; kredi düşümü, QR üretimi, imza doğrulaması ve dükkân sahibi durum geçişleri eklendi.
6. **Gerçek zamanlı durum:** Backend, sipariş durumu değişince SSE olayı yayınlıyor; QR ekranı bu akışı dinliyor. SSE tek yönlü (sunucudan tarayıcıya) bildirim için seçildi.
7. **React ekranları:** Giriş/kayıt, dükkân haritası ve menüsü, sipariş, QR, sipariş geçmişi, abonelik ve dükkân sahibi ekranları eklendi. API isteklerinde oturum token'ı otomatik gönderiliyor.
8. **Kullanılabilirlik ve paketleme:** Ortak kahve temalı tasarım, bildirimler, yükleniyor/hata/boş durumları ve tek seferde başlatmak için Docker Compose eklendi.

### Siparişin teknik akışı

1. Tarayıcı FastAPI'ye sipariş isteği gönderir.
2. Backend kullanıcının aktif aboneliğini, kalan hakkını ve seçilen ürün/dükkânı kontrol eder.
3. Uygunsa sipariş ve imzalı QR verisi SQLite'a kaydedilir; sınırlı paketlerde bir kahve hakkı düşürülür.
4. Dükkân sahibi siparişi sırayla kabul eder, hazırlar ve hazır durumuna getirir.
5. Durum değişikliği veritabanına kaydedildikten sonra SSE olayı yayınlanır ve müşterinin QR ekranı güncellenir.
6. Teslim sırasında QR imzası ve sipariş erişimi doğrulanır.

SSE olayları mevcut geliştirme kurulumunda tek backend sürecinin belleğinde tutulur. Birden fazla backend worker'ı/replica kullanılacaksa Redis gibi paylaşımlı bir mesajlaşma katmanı gerekir.

## Proje yapısı

```text
backend/
  auth.py                 Kayıt, giriş, OTP ve kullanıcı yetkileri
  database.py             SQLite şeması ve bağlantısı
  orders.py               Siparişler, QR doğrulama ve SSE olayları
  order_events.py         Backend süreci içindeki SSE olay dağıtıcısı
  shops.py                Dükkân arama, mesafe ve menü endpoint'leri
  subscriptions.py        Paketler ve simüle ödeme endpoint'leri
  seed_data.py            Örnek müşteri, abonelik, dükkân ve ürünler
  seed_shop_owner.py      Demo dükkân sahibi hesabı
  Dockerfile              Backend container imajı
frontend/
  src/pages/              React sayfaları
  src/components/         Ortak ekranlar ve UI bileşenleri
  src/lib/api.ts          Backend istemcisi ve SSE bağlantısı
  Dockerfile              React derlemesi ve Nginx imajı
  nginx.conf              API proxy ve SPA sayfa yönlendirmesi
docker-compose.yml        Backend, frontend ve kalıcı veri volume'u
KahveCell'i Baslat.bat    Docker'ı başlatıp siteyi açan Windows kısayolu
KahveCell'i Durdur.bat    Compose uygulamasını durduran Windows kısayolu
```

## Docker ile çalıştırma

Windows bilgisayarda Docker Desktop kurulu ve açık olmalıdır. Docker Desktop Linux container'ları için WSL2'yi kullanır; ilk kurulum sırasında WSL kurulumu ve Windows'u yeniden başlatma gerekebilir.

### Her gün kullanma

Proje klasöründe `KahveCell'i Baslat.bat` dosyasına çift tıkla. Docker Desktop'ı başlatır, Compose servislerini açar ve siteyi tarayıcıda gösterir. Durdurmak için `KahveCell'i Durdur.bat` dosyasına çift tıkla.

### Terminalden çalıştırma

Proje klasöründe:

```powershell
docker compose up --build -d --wait
```

- Site: http://localhost:8081
- FastAPI Swagger dokümantasyonu: http://localhost:8000/docs

Servisleri durdur:

```powershell
docker compose down
```

Veritabanı ve QR/JWT imzalama anahtarları `kahvecell-data` adlı Docker volume'unda saklanır. `docker compose down -v` çalıştırmak bu volume'u ve içindeki uygulama verisini siler; normal durdurma için `-v` kullanma.

Port `8080` başka bir uygulama (örneğin Adobe Connect) tarafından kullanıldığı için frontend `8081` portundan sunulur.

## Ücretsiz canlı demo (Render)

Depoda bulunan `render.yaml`, React arayüzü ve FastAPI backend'ini Render'ın ücretsiz katmanında ayrı servisler olarak yayınlayacak şekilde hazırlanmıştır. Ücretsiz katmanda kalmak için servisleri oluştururken **Free** seç; ücretli plan seçme ve ödeme yöntemi ekleme. Render hesabıyla GitHub deposunu bağlayıp **New > Blueprint** üzerinden bu depoyu seçerek kurulumu başlatabilirsin. Render, `render.yaml` dosyasındaki iki servisi (`kahvecell-web-reset-34` ve `kahvecell-api-reset-34`) birlikte oluşturur. İlk derleme birkaç dakika sürebilir.

Canlı demo adresleri:

- Site: https://kahvecell-web-reset-34.onrender.com
- Backend: https://kahvecell-api-reset-34.onrender.com
- API dokümantasyonu: https://kahvecell-api-reset-34.onrender.com/docs

Ücretsiz katmanın önemli sınırları:

- Backend 15 dakika istek almazsa uykuya geçer; ilk açılış isteği yaklaşık bir dakika bekleyebilir.
- Ücretsiz servisin dosya sistemi kalıcı değildir. Backend yeniden başladığında SQLite verisi sıfırlanabilir; başlangıç betiği örnek dükkânları yeniden oluşturur.
- Bu nedenle canlı demo hesabına gerçek telefon, parola, kart veya kişisel veri girme. OTP ve ödeme zaten simülasyondur.
- Ücretsiz kullanım kotası aşılırsa ücretli plana geçmeden önce servisi durdur; ücretsiz planda devam etmek için ödeme yöntemi ekleme.

Her Render deploy'unda JWT ve QR imza anahtarları gizli ortam değişkenleri olarak otomatik üretilir; anahtarlar kaynak koda yazılmaz. SQLite dosyası ücretsiz katmanda kalıcı olmadığı için bu yayın eğitim ve gösterim içindir, gerçek kullanıcılar için uygun değildir.

> Bu proje için oluşturulan herkese açık GitHub deposu kaynak kodunu gösterir. Render servisi ayrıca oluşturulup deploy edilene kadar internette çalışan site adresi oluşmaz.

## Demo hesapları ve test akışı

İlk başlatmada Ankara'da örnek dükkânlar ve demo dükkân sahibi hazırlanır:

- Dükkân sahibi telefonu: `05550000002`
- Dükkân sahibi şifresi: `KahveShop123!`
- OTP test kodu: `1234`
- Ödeme formu test kartı: `4242 4242 4242 4242`

Müşteri akışı için kayıt ekranından hesap oluşturup OTP kodu `1234` ile doğrula. Ardından paket satın al, dükkân seç, sipariş ver ve QR ekranından durumu takip et. Dükkân sahibi ekranında aynı demo sahibi hesabıyla sipariş durumlarını ilerletip QR kodunu doğrula.

Bu hesaplar sadece yerel demo içindir; gerçek kullanıcı parolası veya ödeme kartı olarak kullanma.

## API ve veri modeli

API'nin ortak öneki `/api/v1`'dir. Tüm istek ve modelleri http://localhost:8000/docs Swagger arayüzünde inceleyebilirsin.

| Alan | Örnek endpoint'ler | İşlev |
|---|---|---|
| Auth | `/auth/register`, `/auth/verify-otp`, `/auth/login`, `/auth/refresh`, `/auth/me` | Hesap oluşturma, doğrulama ve oturum |
| Dükkânlar | `/shops`, `/shops/{shop_id}`, `/shops/{shop_id}/menu` | Arama, konum, dükkân detayı ve menü |
| Abonelik/ödeme | `/subscriptions/plans`, `/subscriptions`, `/subscriptions/me`, `/payments/history` | Paketler, test ödemesi ve abonelik yönetimi |
| Sipariş | `/orders`, `/orders/history`, `/orders/shop`, `/orders/{order_id}` | Sipariş oluşturma, müşteri geçmişi ve dükkân kuyruğu |
| Durum/QR | `/orders/{order_id}/status`, `/orders/{order_id}/events`, `/orders/{order_id}/status` (PATCH), `/orders/{order_id}/verify-qr` | Durum okuma, SSE akışı, durum geçişi ve QR doğrulama |

SQLite şeması kullanıcılar, yenileme oturumları, abonelikler, ödeme işlemleri, dükkânlar, ürünler ve siparişleri tutar. Veritabanı dosyası ve imzalama anahtarları yerel geliştirme verisidir; GitHub'a eklenmemelidir.

## Geliştirme ve doğrulama komutları

Frontend:

```powershell
cd frontend
npm ci
npm run lint
npm run build
```

Backend bağımlılıkları `backend/requirements.txt` içinde listelenir. Docker image'ı bunları otomatik kurar. Docker öncesi Python sözdizimi kontrolü:

```powershell
cd backend
python -m py_compile main.py auth.py database.py orders.py order_events.py shops.py subscriptions.py
```

## Herkese açık GitHub deposu

Kodun herkese açık deposu: https://github.com/reset-34/kahvecell

Git deposu ve ilk yerel kayıt (commit) hazırlandı. Sonraki değişiklikleri GitHub'a göndermek için proje klasöründe şu adımları izle:

1. Değişen dosyaları ve Git'in takip edeceği dosyaları kontrol et:

   ```powershell
   git status
   ```

2. Göndermek istediğin dosyaları Git'e ekle ve neleri göndereceğini tekrar kontrol et:

   ```powershell
   git add .
   git status
   ```

   `kahvecell.db`, `.jwt_secret`, `.qr_secret`, `.env`, `.venv` veya `node_modules` listede görünmemeli. Kök `.gitignore` bu yerel dosyaları dışarıda tutar.

3. Değişiklikleri açıklayan Türkçe bir kayıt oluştur ve GitHub'a gönder:

   ```powershell
   git commit -m "Türkçe kısa değişiklik açıklaması"
   git push
   ```

   Örnek: `git commit -m "Sipariş ekranını iyileştir"`

GitHub giriş penceresi açılırsa oradan giriş yap; parolanı veya erişim anahtarını sohbet ya da proje dosyalarına yazma. Depodaki dükkân sahibi hesabı yalnızca demo içindir; gerçek bir sistemde varsayılan demo hesabını kaldır.

> Herkese açık GitHub deposu kodu ve açıklamaları gösterir; siteyi herkesin kullanabileceği şekilde internette kendiliğinden çalıştırmaz. Canlı site için FastAPI, SQLite ve Docker'ı çalıştırabilen ayrı bir sunucuya dağıtım gerekir. GitHub Pages yalnızca frontend dosyalarını sunar; bu full-stack uygulamanın backend'ini tek başına çalıştıramaz.
