const SUPABASE_URL = "https://bskmfqksqrenxcanzaul.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJza21mcWtzcXJlbnhjYW56YXVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3Mjk1MjMsImV4cCI6MjA5MzMwNTUyM30.a4F5Cb1iS60PPFXv5Otp9ZWR-jjV4-GdyIjRH4Kr75o"; // Ambil dari Settings > API
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let userLogin = JSON.parse(localStorage.getItem("user"));
let fotoData = null, streamKamera = null;

// --- FIXED LOGIN LOGIC (PERTAHANKAN) ---
async function handleLogin() {
    const u = document.getElementById("username").value.trim();
    const p = document.getElementById("password").value.trim();
    const btn = document.getElementById("btn-login-action");

    if (!u || !p) return alert("Isi username dan password!");

    btn.innerText = "Mengecek...";
    btn.disabled = true;

    try {
        const { data, error } = await supabaseClient
            .from("users")
            .select("*")
            .eq("username", u)
            .eq("password", p)
            .maybeSingle();

        if (error) throw error;

        if (data) {
            localStorage.setItem("user", JSON.stringify(data));
            userLogin = data;
            tampilkanUI();
        } else {
            alert("Username atau Password salah!");
        }
    } catch (err) {
        alert("Koneksi Error: " + err.message);
    } finally {
        btn.innerText = "MASUK";
        btn.disabled = false;
    }
}

function tampilkanUI() {
    document.getElementById("login-section").style.display = "none";
    document.getElementById("main-content").style.display = "block";
    document.getElementById("navbar").style.display = "flex";
    cekRoleAdmin(); aktifkanKamera(); updateLeaderboard('bulan'); cariLaporan(); loadListAnggota();
}

function switchPage(p, b) {
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    document.getElementById(p).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    b.classList.add('active');
    aktifkanKamera();
}

function logout() { localStorage.clear(); location.reload(); }

if (userLogin) tampilkanUI();

// --- PHOTO & COMPRESSION ---
function tangkapFoto(tipe) {

    const video = tipe === 'absen'
        ? document.getElementById('video-feed')
        : document.getElementById('video-setor');

    const img = tipe === 'absen'
        ? document.getElementById('img-final')
        : document.getElementById('img-setor-final');

    const canvas = document.getElementById('canvas-capture');

    // tombol
    const btnAmbilAbsen = document.getElementById('btn-ambil');
    const btnUlangAbsen = document.getElementById('btn-ulang');

    // VALIDASI VIDEO
    if (!video || video.videoWidth === 0) {
        return alert("Kamera belum siap.");
    }

    // ukuran canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // ambil gambar
    const ctx = canvas.getContext('2d');

    // balik canvas supaya hasil akhir tidak mirror
    ctx.save();

    ctx.scale(-1, 1);

    ctx.drawImage(
        video,
        -canvas.width,
        0,
        canvas.width,
        canvas.height
    );

    ctx.restore();

    // SIMPAN FOTO GLOBAL
    fotoData = canvas.toDataURL('image/jpeg', 0.8);

    console.log("Foto berhasil diambil");

    // tampilkan preview
    img.src = fotoData;

    video.classList.add('hidden');
    img.classList.remove('hidden');

    // MODE ABSEN
    if (tipe === 'absen') {

        btnAmbilAbsen.classList.add('hidden');
        btnUlangAbsen.classList.remove('hidden');

    }

    // MODE SETOR
    else {

        const tombolSetor = document.querySelector(
            '#page-setor button'
        );

        if (tombolSetor) {

            tombolSetor.innerText = "ULANG FOTO";

            tombolSetor.classList.remove(
                'bg-indigo-600'
            );

            tombolSetor.classList.add(
                'bg-amber-500'
            );

            tombolSetor.onclick = function () {

                fotoData = null;

                video.classList.remove('hidden');
                img.classList.add('hidden');

                tombolSetor.innerText =
                    "AMBIL FOTO BUKTI";

                tombolSetor.classList.remove(
                    'bg-amber-500'
                );

                tombolSetor.classList.add(
                    'bg-indigo-600'
                );

                tombolSetor.onclick = function () {
                    tangkapFoto('setor');
                };
            };
        }
    }
}
// PASTIKAN NAMA FUNGSI PERSIS SEPERTI INI
async function prosesAbsen(shiftId) {

    // =========================
    // VALIDASI FOTO
    // =========================

    if (!fotoData) {
        return alert("Ambil foto dulu!");
    }

    try {

        // =========================
        // TANGGAL INDONESIA
        // =========================

        const now = new Date();

        const tanggalIndonesia =
            new Intl.DateTimeFormat('sv-SE', {
                timeZone: 'Asia/Jakarta'
            }).format(now);

        // =========================
        // VALIDASI PRESENSI GANDA
        // =========================

        const { data: existingPresensi, error: existingError } =
            await supabaseClient
                .from('presensi')
                .select('id')
                .eq('username', userLogin.username)
                .eq('shift', shiftId)
                .eq('tanggal', tanggalIndonesia)
                .limit(1);

        if (existingError) {
            throw existingError;
        }

        if (
            existingPresensi &&
            existingPresensi.length > 0
        ) {

            return alert(
                `Kamu sudah melakukan presensi shift ${shiftId} hari ini`
            );
        }

        // =========================
        // AMBIL SETTING SHIFT
        // =========================

        const { data: shiftSetting, error: errShift } =
            await supabaseClient
                .from('shift_settings')
                .select('jam_masuk, menit_masuk')
                .eq('id', shiftId)
                .single();

        if (errShift) {
            throw errShift;
        }

        // =========================
        // HITUNG KETERLAMBATAN
        // =========================

        const sekarang = new Date();

        const jamSekarang =
            sekarang.getHours();

        const menitSekarang =
            sekarang.getMinutes();

        const totalMenitAbsen =
            (jamSekarang * 60) +
            menitSekarang;

        const totalMenitJadwal =
            (shiftSetting.jam_masuk * 60) +
            shiftSetting.menit_masuk;

        const selisih =
            totalMenitAbsen -
            totalMenitJadwal;

        let poinDapat = 0;

        let statusAbsen = "";

        // =========================
        // SISTEM POINT BARU
        // =========================

        // TEPAT WAKTU / LEBIH AWAL
        if (selisih <= 0) {

            poinDapat = 25;

            statusAbsen =
                "Tepat Waktu";
        }

        // TELAT <= 15 MENIT
        else if (
            selisih > 0 &&
            selisih <= 15
        ) {

            poinDapat = 10;

            statusAbsen =
                "Terlambat < 15 Menit";
        }

        // TELAT > 15 MENIT
        else {

            poinDapat = 5;

            statusAbsen =
                "Terlambat > 15 Menit";
        }

        // =========================
        // SIMPAN PRESENSI
        // =========================

        const fotoURL =
            await uploadFotoToStorage(
                fotoData,
                "absen"
            );

        const { error: errPresensi } =
            await supabaseClient
                .from('presensi')
                .insert([{

                    username:
                        userLogin.username,

                    shift:
                        shiftId,

                    foto_diri:
                        fotoURL,

                    waktu:
                        sekarang.toISOString(),

                    tanggal:
                        tanggalIndonesia,

                    poin_didapat:
                        poinDapat,

                    keterangan:
                        statusAbsen

                }]);

        if (errPresensi) {
            throw errPresensi;
        }

        // =========================
        // AMBIL SCORE USER
        // =========================

        const { data: userData, error: errUser } =
            await supabaseClient
                .from('users')
                .select('score')
                .eq(
                    'username',
                    userLogin.username
                )
                .single();

        if (errUser) {
            throw errUser;
        }

        // =========================
        // UPDATE SCORE
        // =========================

        const scoreLama =
            userData?.score || 0;

        const scoreBaru =
            scoreLama + poinDapat;

        const { error: errUpdate } =
            await supabaseClient
                .from('users')
                .update({
                    score: scoreBaru
                })
                .eq(
                    'username',
                    userLogin.username
                );

        if (errUpdate) {
            throw errUpdate;
        }

        // =========================
        // SUCCESS
        // =========================

        alert(
            `Absen Berhasil!\n\n` +
            `Status: ${statusAbsen}\n` +
            `Point: +${poinDapat}`
        );

        location.reload();

    } catch (err) {

        console.error(err);

        alert(
            "Gagal memproses presensi:\n" +
            err.message
        );
    }
}
async function aktifkanKamera() {
    const isSetor = document.getElementById('page-setor').classList.contains('active');
    const video = document.getElementById(isSetor ? 'video-setor' : 'video-feed');
    try {
        if (streamKamera) streamKamera.getTracks().forEach(t => t.stop());
        streamKamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        video.srcObject = streamKamera;
    } catch (err) { console.warn("Kamera tidak aktif"); }
}

function resetKamera() { location.reload(); }

function zoomFoto(url) {
    if (!url || url === 'null' || url === 'undefined') {
        return alert("Maaf, foto bukti tidak ditemukan untuk data ini.");
    }

    // Membuat jendela baru untuk menampilkan foto secara penuh
    const win = window.open("", "_blank");
    win.document.write(`
        <html>
            <head><title>Bukti Setor</title></head>
            <body style="margin:0; background:#000; display:flex; align-items:center; justify-content:center;">
                <img src="${url}" style="max-width:100%; max-height:100vh; border: 2px solid white; border-radius: 8px;">
                <div style="position:fixed; top:20px; right:20px;">
                    <button onclick="window.close()" style="padding:10px; cursor:pointer;">Tutup</button>
                </div>
            </body>
        </html>
    `);
}

// --- SHIFT LOGIC ---
async function updateShiftButtons() {
    const now = new Date();
    const jamSekarang = now.getHours();
    const menitSekarang = now.getMinutes();
    const totalMenitSekarang = (jamSekarang * 60) + menitSekarang;

    const container = document.getElementById('shift-container');
    const clockElement = document.getElementById('live-clock');

    if (clockElement) clockElement.innerText = now.toLocaleTimeString('id-ID');

    try {
        // Ambil jadwal terbaru dari database
        const { data: jadwalDB, error } = await supabaseClient
            .from('shift_settings')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        if (container && jadwalDB) {
            container.innerHTML = ""; // Bersihkan container sebelum render ulang

            jadwalDB.forEach(s => {
                // Konversi jam mulai & selesai ke total menit
                const mulaiMenit = (s.jam_masuk * 60) + s.menit_masuk - 15; // Aktif 15 menit sebelum
                const selesaiMenit = (s.jam_keluar * 60) + s.menit_keluar;

                // Cek apakah waktu sekarang berada di dalam rentang shift
                const isAktif = (totalMenitSekarang >= mulaiMenit && totalMenitSekarang < selesaiMenit);

                // Format jam untuk tampilan (contoh: 08:00)
                const displayJam = s.jam_masuk.toString().padStart(2, '0') + ":" + s.menit_masuk.toString().padStart(2, '0');

                const btn = document.createElement('button');
                btn.className = `p-4 rounded-2xl font-bold text-[10px] transition-all ${isAktif
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`;

                btn.innerHTML = `SHIFT ${s.id}<br>${displayJam}`;

                // Jika aktif, bisa diklik. Jika tidak, munculkan peringatan.
                btn.onclick = isAktif
                    ? () => prosesAbsen(s.id)
                    : () => alert(`Belum waktunya! Shift ${s.id} dimulai jam ${displayJam}`);

                container.appendChild(btn);
            });
        }
    } catch (err) {
        console.error("Gagal memuat tombol shift:", err);
    }
}

// Jalankan fungsi saat halaman dimuat
updateShiftButtons();

// --- FUNGSI SETOR BANK ---
async function laporSetor() {

    const inputFeb =
        document.getElementById(
            'setor_uang_feb'
        );

    const inputMini =
        document.getElementById(
            'setor_uang_minibank'
        );

    const febVal =
        inputFeb
            ? (inputFeb.value || 0)
            : 0;

    const miniVal =
        inputMini
            ? (inputMini.value || 0)
            : 0;

    // VALIDASI
    if (!fotoData) {

        return alert(
            "Ambil foto bukti setor terlebih dahulu!"
        );
    }

    if (febVal == 0 && miniVal == 0) {

        return alert(
            "Masukkan nominal setoran!"
        );
    }

    // Ambil pendamping
    const pendampingTerpilih =
        Array.from(
            document.querySelectorAll(
                'input[name="pendamping"]:checked'
            )
        ).map(el => el.value);

    try {

        console.log(
    "Memulai proses laporan setor..."
);


        const fotoUrl =
            await uploadFotoToStorage(
                fotoData,
                "setor"
            );

        console.log(
            "Foto berhasil diupload:",
            fotoUrl
        );

        // =========================
        // INSERT DATA UTAMA
        // =========================

        const {
            data: mainData,
            error: mainError
        } = await supabaseClient

            .from("setor_bank")

            .insert([{

                user_id:
                    userLogin.id,

                username:
                    userLogin.username,

                foto_diri:
                    fotoUrl,

                pendamping:
                    pendampingTerpilih.join(", "),

                uang_feb:
                    Number(febVal),

                uang_minibank:
                    Number(miniVal),

                poin_didapat:
                    25,

                is_pendamping:
                    false

            }])

            .select()

            .single();

        if (mainError) {
            throw mainError;
        }

        // =========================
        // TAMBAH POIN USER UTAMA
        // =========================

        await tambahPoinUser(
            userLogin.username,
            25
        );

        // =========================
        // INSERT PENDAMPING
        // =========================

        if (
            pendampingTerpilih.length > 0
        ) {

            const barisPendamping =
                pendampingTerpilih.map(
                    nama => ({

                        username:
                            nama,

                        foto_diri:
                            fotoUrl,

                        pendamping:
                            "Pendamping dari " +
                            userLogin.username,

                        uang_feb:
                            0,

                        uang_minibank:
                            0,

                        poin_didapat:
                            25,

                        is_pendamping:
                            true,

                        parent_id:
                            mainData.id

                    })
                );

            const {
                error: pendampingError
            } = await supabaseClient

                .from("setor_bank")

                .insert(
                    barisPendamping
                );

            if (pendampingError) {
                throw pendampingError;
            }

            // tambah poin pendamping
            for (
                const nama of
                pendampingTerpilih
            ) {

                await tambahPoinUser(
                    nama,
                    25
                );
            }
        }

        // =========================
        // SUCCESS
        // =========================

        alert(
            "Laporan berhasil!\n\n" +
            "Anda dan pendamping " +
            "mendapatkan +25 poin."
        );

        // reset form
        if (inputFeb) {
            inputFeb.value = "";
        }

        if (inputMini) {
            inputMini.value = "";
        }

        fotoData = null;

        // refresh data
        cariRiwayatSetor();

        updateLeaderboard(
            'bulan'
        );

    } catch (err) {

        console.error(
            "Gagal Lapor Setor:",
            err
        );

        alert(
            "Terjadi kesalahan:\n" +
            err.message
        );
    }
}

async function simpanLaporan() {
    const shiftVal = document.getElementById('lap_shift').value;
    const ket = document.getElementById('lap_keterangan').value;
    if (!shiftVal) return alert("Pilih Shift!");

    const { error } = await supabaseClient.from("laporan_akhir").insert([{
        user_id: userLogin.id, username: userLogin.username,
        shift_dipilih: shiftVal,
        uang_feb: document.getElementById('uang_feb').value || 0,
        admin_feb: document.getElementById('admin_feb').value || 0,
        uang_minibank: document.getElementById('uang_minibank').value || 0,
        admin_minibank: document.getElementById('admin_minibank').value || 0,
        keterangan: ket, status_minus: ket.toLowerCase().includes("minus")
    }]);
    if (!error) { alert("Laporan Berhasil!"); cariLaporan(); }
}

async function cariLaporan() {
    const tgl = document.getElementById('filter_tgl_laporan').value;
    const shift = document.getElementById('filter_shift_laporan').value;

    let query = supabaseClient.from("laporan_akhir").select("*");

    if (tgl) {
        query = query.gte("created_at", `${tgl}T00:00:00Z`).lte("created_at", `${tgl}T23:59:59Z`);
    }
    if (shift) {
        query = query.eq("shift_dipilih", shift);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    const listEl = document.getElementById('list-laporan-akhir');

    if (error) return console.error(error);

    if (data && data.length > 0) {
        listEl.innerHTML = data.map(i => `
            <div class="p-4 bg-slate-50 rounded-2xl border text-[11px] relative mb-3 shadow-sm">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <p class="font-black text-blue-600 uppercase">${i.username}</p>
                        <p class="text-slate-400 text-[9px]">${new Date(i.created_at).toLocaleString('id-ID')}</p>
                    </div>
                    <span class="px-2 py-1 rounded-lg ${i.status_minus ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'} font-black">
                        ${i.shift_dipilih} ${i.status_minus ? '(MINUS)' : '(OK)'}
                    </span>
                </div>
                
                <div class="grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-slate-100 mb-2">
                    <div>
                        <p class="text-slate-400 text-[9px]">UANG FEB</p>
                        <p class="font-bold text-slate-700">Rp ${Number(i.uang_feb).toLocaleString('id-ID')}</p>
                    </div>
                    <div>
                        <p class="text-slate-400 text-[9px]">ADMIN FEB</p>
                        <p class="font-bold text-slate-700">Rp ${Number(i.admin_feb).toLocaleString('id-ID')}</p>
                    </div>
                    <div class="border-t pt-1">
                        <p class="text-slate-400 text-[9px]">UANG MINIBANK</p>
                        <p class="font-bold text-slate-700">Rp ${Number(i.uang_minibank).toLocaleString('id-ID')}</p>
                    </div>
                    <div class="border-t pt-1">
                        <p class="text-slate-400 text-[9px]">ADMIN MINIBANK</p>
                        <p class="font-bold text-slate-700">Rp ${Number(i.admin_minibank).toLocaleString('id-ID')}</p>
                    </div>
                </div>

                <p class="text-slate-500 italic bg-slate-100 p-2 rounded-lg">
                    <span class="font-bold">Ket:</span> ${i.keterangan || 'Tidak ada keterangan'}
                </p>
            </div>
        `).join("");
    } else {
        listEl.innerHTML = "<p class='text-center text-slate-400 text-xs py-10'>Data tidak ditemukan</p>";
    }
}

async function cariRiwayatSetor() {
    const tgl = document.getElementById('filter_tgl_setor').value;
    const listEl = document.getElementById('list-riwayat-setor');

    listEl.innerHTML = "<p class='text-center text-slate-400 text-[10px] py-4'>Memuat data...</p>";

    try {
        let query = supabaseClient.from("setor_bank")
            .select("*")
            .eq("is_pendamping", false);

        if (tgl) {
            query = query.gte("created_at", `${tgl}T00:00:00Z`).lte("created_at", `${tgl}T23:59:59Z`);
        }

        const { data, error } = await query.order("created_at", { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
            listEl.innerHTML = data.map(i => {
                const canDelete = (userLogin.role === 'admin' || userLogin.username === i.username);

                return `
                    <div class="p-3 bg-slate-50 rounded-2xl border text-[10px] mb-2 shadow-sm">
                        <div class="flex justify-between items-center mb-2">
                            <div class="flex items-center gap-2">
                                <p class="font-black text-indigo-600 uppercase">${i.username}</p>
                                <span class="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full text-[7px] font-bold">+25 PT</span>
                            </div>
                            <div class="flex items-center gap-3">
                                <p class="text-slate-400">${new Date(i.created_at).toLocaleDateString('id-ID')}</p>
                                ${canDelete ? `
                                    <button onclick='hapusRiwayat(${JSON.stringify(i)}, "setor_bank")' class="text-red-500 font-bold hover:scale-110 transition-transform">
                                        🗑️ HAPUS
                                    </button>
                                ` : ''}
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-2 bg-white p-2 rounded-lg border border-slate-100 mb-1">
                            <div>
                                <p class="text-slate-400 text-[8px]">SETOR FEB</p>
                                <p class="font-bold text-slate-700 italic">Rp ${Number(i.uang_feb).toLocaleString('id-ID')}</p>
                            </div>
                            <div>
                                <p class="text-slate-400 text-[8px]">SETOR MINIBANK</p>
                                <p class="font-bold text-slate-700 italic">Rp ${Number(i.uang_minibank).toLocaleString('id-ID')}</p>
                            </div>
                        </div>

                        <div class="flex justify-between items-center mt-1">
                            <p class="text-[8px] text-slate-400 italic font-medium">
                                🤝 Pendamping: ${i.pendamping || '-'}
                            </p>
                            <button onclick="zoomFoto('${i.foto_diri}')" class="text-blue-500 font-bold text-[8px]">
                                👁️ LIHAT BUKTI
                            </button>
                        </div>
                    </div>
                `;
            }).join("");
        } else {
            listEl.innerHTML = "<p class='text-center text-slate-400 text-[10px] py-4'>Tidak ada riwayat utama</p>";
        }
    } catch (err) {
        console.error("Error riwayat setor:", err);
        listEl.innerHTML = `<p class='text-center text-red-500 text-[10px] py-4'>Gagal memuat data: ${err.message}</p>`;
    }
}

async function updateLeaderboard(tipe) {
    const now = new Date();
    let start, end;

    // 1. Penentuan Rentang Waktu
    if (tipe === 'bulan') {
        start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    } else if (tipe === 'ytd') {
        start = new Date(now.getFullYear(), 0, 1).toISOString();
        end = now.toISOString();
    } else {
        start = document.getElementById('rank_start').value ? new Date(document.getElementById('rank_start').value).toISOString() : new Date(0).toISOString();
        end = document.getElementById('rank_end').value ? new Date(document.getElementById('rank_end').value + "T23:59:59").toISOString() : new Date().toISOString();
    }

    try {
        // 2. Pengambilan Data dari Supabase
        const { data: presensi } = await supabaseClient.from("presensi").select("username, poin_didapat").gte("created_at", start).lte("created_at", end);
        const { data: setor } = await supabaseClient.from("setor_bank").select("username, poin_didapat").gte("created_at", start).lte("created_at", end);

        // 3. Pengolahan Data
        const totalPoin = {};
        [...(presensi || []), ...(setor || [])].forEach(item => {
            totalPoin[item.username] = (totalPoin[item.username] || 0) + (item.poin_didapat || 0);
        });

        // Variabel 'sorted' didefinisikan di sini
        const sorted = Object.entries(totalPoin).sort((a, b) => b[1] - a[1]);

        const listEl = document.getElementById("leaderboard-list");

        // 4. Render UI
        if (sorted.length === 0) {
            listEl.innerHTML = "<p class='text-center text-slate-400 text-xs'>Tidak ada data pada periode ini</p>";
        } else {
            // Render List Utama terlebih dahulu
            listEl.innerHTML = sorted.map((u, i) => `
                <div onclick="ambilUserIdLaluRiwayat('${u[0]}')" class="flex justify-between items-center p-4 bg-white rounded-2xl border cursor-pointer hover:bg-slate-50 transition-all mb-2">
                    <span class="font-bold text-slate-700">#${i + 1} ${u[0]}</span>
                    <span class="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-black">${u[1]} PTS</span>
                </div>
            `).join("");

            // 5. Render Podium (Hanya jika tipe 'bulan' dan minimal ada 3 orang)
            // Bagian ini ditaruh SETELAH listEl.innerHTML terisi agar bisa ditambah (prepend)
            if (tipe === 'bulan' && sorted.length >= 3) {
                let podiumHTML = `
               <div class="flex items-end justify-center gap-3 mb-10 mt-16 md:mt-20 h-[260px]">
                    <div class="flex flex-col items-center">
                        <div class="relative mb-3">
                            <div class="absolute inset-0 bg-slate-300 blur-xl opacity-40 rounded-full"></div>
                            <div class="relative w-16 h-16 rounded-full border-[4px] border-slate-300 overflow-hidden bg-white shadow-xl">
                                <img src="https://ui-avatars.com/api/?name=${sorted[1][0]}&background=cbd5e1&color=fff" class="w-full h-full object-cover">
                            </div>
                        </div>
                        <div class="relative bg-gradient-to-b from-slate-200 to-slate-400 w-24 h-28 rounded-t-[24px] flex flex-col items-center justify-center shadow-2xl border-4 border-slate-300">
                            <div class="absolute -top-4 bg-white border-4 border-slate-300 w-10 h-10 rounded-full flex items-center justify-center shadow-lg">🥈</div>
                            <span class="text-white font-black text-3xl mt-2">2</span>
                            <span class="text-[10px] text-white font-bold truncate px-2 max-w-full">${sorted[1][0]}</span>
                        </div>
                    </div>

                    <div class="flex flex-col items-center">
                        <div class="relative mb-3">
                            <div class="absolute inset-0 bg-yellow-400 blur-2xl opacity-60 rounded-full animate-pulse"></div>
                            <div class="relative w-20 h-20 rounded-full border-[5px] border-yellow-400 overflow-hidden bg-white shadow-2xl">
                                <img src="https://ui-avatars.com/api/?name=${sorted[0][0]}&background=facc15&color=fff" class="w-full h-full object-cover">
                            </div>
                        </div>
                        <div class="relative bg-gradient-to-b from-yellow-300 to-yellow-500 w-28 h-40 rounded-t-[28px] flex flex-col items-center justify-center shadow-2xl border-[5px] border-yellow-400">
                            <div class="absolute -top-5 bg-white border-[5px] border-yellow-400 w-14 h-14 rounded-full flex items-center justify-center shadow-xl text-2xl">👑</div>
                            <span class="text-white font-black text-5xl mt-4 drop-shadow-lg">1</span>
                            <span class="text-sm text-yellow-50 font-extrabold truncate px-2 max-w-full">${sorted[0][0]}</span>
                        </div>
                    </div>

                    <div class="flex flex-col items-center">
                        <div class="relative mb-3">
                            <div class="absolute inset-0 bg-orange-400 blur-xl opacity-40 rounded-full"></div>
                            <div class="relative w-16 h-16 rounded-full border-[4px] border-orange-400 overflow-hidden bg-white shadow-xl">
                                <img src="https://ui-avatars.com/api/?name=${sorted[2][0]}&background=fb923c&color=fff" class="w-full h-full object-cover">
                            </div>
                        </div>
                        <div class="relative bg-gradient-to-b from-orange-300 to-orange-500 w-24 h-24 rounded-t-[24px] flex flex-col items-center justify-center shadow-2xl border-4 border-orange-400">
                            <div class="absolute -top-4 bg-white border-4 border-orange-400 w-10 h-10 rounded-full flex items-center justify-center shadow-lg">🥉</div>
                            <span class="text-white font-black text-3xl mt-2">3</span>
                            <span class="text-[10px] text-orange-50 font-bold truncate px-2 max-w-full">${sorted[2][0]}</span>
                        </div>
                    </div>
                </div>`;

                // Masukkan podium di atas list
                listEl.innerHTML = podiumHTML + listEl.innerHTML;
            }
        }
    } catch (err) {
        console.error("Leaderboard Error:", err);
    }
}

async function ambilUserIdLaluRiwayat(username) {
    const modal = document.getElementById("modal-riwayat");
    const content = document.getElementById("modal-content");
    const title = document.getElementById("modal-title");

    title.innerText = `RIWAYAT: ${username}`;
    content.innerHTML = "<p class='text-center text-xs text-slate-400 py-10'>Memuat riwayat...</p>";
    modal.style.display = "block";

    try {
        const { data: dataAbsen, error: errA } = await supabaseClient
            .from("presensi")
            .select("id, created_at, shift, foto_diri, poin_didapat")
            .eq("username", username);

        if (errA) throw errA;

        const { data: dataSetor, error: errS } = await supabaseClient
            .from("setor_bank")
            .select("id, created_at, uang_feb, uang_minibank, foto_diri, poin_didapat, is_pendamping, parent_id")
            .eq("username", username);

        if (errS) throw errS;

        const semuaRiwayat = [
            ...(dataAbsen || []).map(d => ({ ...d, tipe: 'SHIFT', target_table: 'presensi' })),
            ...(dataSetor || []).map(d => ({ ...d, tipe: 'SETOR', target_table: 'setor_bank' }))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (semuaRiwayat.length === 0) {
            content.innerHTML = "<p class='text-center text-xs text-slate-400 py-10'>Belum ada aktivitas tercatat.</p>";
            return;
        }

        content.innerHTML = semuaRiwayat.map(item => {
            const tgl = new Date(item.created_at).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });

            const canDelete = (userLogin.role === 'admin' || userLogin.username === username);

            let detailInfo = "";
            if (item.tipe === 'SHIFT') {
                detailInfo = `<p class="text-blue-600 font-bold text-[10px] uppercase">📍 Shift ${item.shift}</p>`;
            } else {
                const label = item.is_pendamping ? "🤝 Pendamping Setor" : "💰 Setor Bank";
                const nominal = item.is_pendamping ? "" : `: Rp ${(Number(item.uang_feb) + Number(item.uang_minibank)).toLocaleString('id-ID')}`;
                detailInfo = `<p class="text-indigo-600 font-bold text-[10px] uppercase">${label}${nominal}</p>`;
            }

            return `
                <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-3 shadow-sm">
                    <div class="flex gap-3">
                        <div class="w-16 h-20 bg-slate-200 rounded-lg overflow-hidden border border-white shadow-sm flex-shrink-0 cursor-pointer" onclick="zoomFoto('${item.foto_diri}')">
                            <img src="${item.foto_diri}" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/150?text=No+Foto'">
                        </div>
                        
                        <div class="flex-1 flex flex-col justify-between">
                            <div>
                                <div class="flex justify-between items-start mb-1">
                                    ${detailInfo}
                                    <span class="bg-white px-2 py-0.5 rounded-full text-[8px] font-bold text-slate-500 border border-slate-100">+${item.poin_didapat} PT</span>
                                </div>
                                <p class="text-[9px] text-slate-400">${tgl}</p>
                            </div>

                            <div class="flex justify-between items-center mt-2">
                                <button onclick="zoomFoto('${item.foto_diri}')" class="text-[9px] text-blue-500 font-bold hover:underline">🔍 LIHAT FOTO</button>
                                
                                ${canDelete ? `
                                    <button onclick='hapusRiwayat(${JSON.stringify(item)}, "${item.target_table}")' 
                                            class="text-[9px] text-red-500 font-black px-2 py-1 rounded-lg hover:bg-red-50">
                                        🗑️ HAPUS
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

    } catch (err) {
        console.error(err);
        content.innerHTML = `<div class="p-4 bg-red-50 text-red-500 rounded-xl text-center text-xs font-bold">
            Gagal memuat riwayat: <br> ${err.message}
        </div>`;
    }
}

async function lihatRiwayat(uid, name) {
    document.getElementById('modal-title').innerText = "RIWAYAT " + name;
    document.getElementById('modal-riwayat').style.display = "block";
    document.getElementById('modal-content').innerHTML = "Memuat...";

    const { data: p } = await supabaseClient.from("presensi").select("*").eq("user_id", uid);
    const { data: s } = await supabaseClient.from("setor_bank").select("*").eq("user_id", uid);

    const combined = [
        ...(p || []).map(x => ({ ...x, type: 'ABSEN', date: x.created_at })),
        ...(s || []).map(x => ({ ...x, type: 'SETOR', date: x.created_at }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    document.getElementById('modal-content').innerHTML = combined.map(item => `
        <div class="flex gap-3 bg-slate-50 p-3 rounded-2xl border items-center relative">
            <img src="${item.foto_diri || item.foto_diri}" class="w-14 h-20 object-cover rounded-lg shadow-sm">
            <div class="flex-1 text-[10px]">
                <p class="font-black text-blue-600">${item.type} (+${item.poin_didapat})</p>
                <p class="font-bold">${item.shift || 'Setor Bank'}</p>
                <p class="text-slate-400">${new Date(item.date).toLocaleString()}</p>
            </div>
            ${userLogin.role === 'admin' ?
            `<button onclick="hapusRiwayat('${item.id}', '${item.type}', ${item.poin_didapat}, '${uid}')" class="text-red-500 font-bold text-xs p-2">HAPUS</button>` : ''}
        </div>
    `).join("");
}

function toggleCustomRank() { document.getElementById('custom-rank-filter').classList.toggle('hidden'); }
function tutupModal() { document.getElementById('modal-riwayat').style.display = "none"; }

async function tambahPoinUser(username, poin) {
    const { data: userData } = await supabaseClient
        .from("users")
        .select("id, score")
        .eq("username", username)
        .maybeSingle();

    if (userData) {
        const skorBaru = (userData.score || 0) + poin;
        await supabaseClient
            .from("users")
            .update({ score: skorBaru })
            .eq("id", userData.id);
    }
}

async function kurangiPoinUser(username, poin) {
    const { data } = await supabaseClient.from("users").select("id, score").eq("username", username).single();
    if (data) {
        const newScore = Math.max(0, (data.score || 0) - poin);
        await supabaseClient.from("users").update({ score: newScore }).eq("id", data.id);
    }
}

async function hapusRiwayat(item, tabel) {
    if (!confirm("Hapus riwayat ini? Poin akan disesuaikan otomatis.")) return;

    try {
        if (tabel === 'setor_bank') {
            if (!item.is_pendamping) {

    await hapusFotoStorage(
        item.foto_diri
    );
} {
                const { data: children } = await supabaseClient
                    .from("setor_bank")
                    .select("username, poin_didapat")
                    .eq("parent_id", item.id);

                if (children) {
                    for (const child of children) {
                        await kurangiPoinUser(child.username, child.poin_didapat);
                    }
                }
                await supabaseClient.from("setor_bank").delete().eq("parent_id", item.id);
            }
           await kurangiPoinUser(
    item.username,
    item.poin_didapat
);

// hapus file storage
await hapusFotoStorage(
    item.foto_diri
);

// hapus database
await supabaseClient

    .from("setor_bank")

    .delete()

    .eq("id", item.id);
        }
        else {
            await kurangiPoinUser(
    item.username,
    item.poin_didapat
);

// hapus file storage
await hapusFotoStorage(
    item.foto_diri
);

// hapus row database
await supabaseClient

    .from("presensi")

    .delete()

    .eq("id", item.id);
        }

        alert("Penghapusan berhasil.");
        location.reload();
    } catch (err) {
        alert("Gagal: " + err.message);
    }
}

async function loadListAnggota() {
    const { data } = await supabaseClient.from("users").select("username").order("username");
    if (data && userLogin) {
        const list = data.filter(u => u.username !== userLogin.username);
        document.getElementById("list-anggota-setor").innerHTML = list.map(u => `
            <label class="flex items-center gap-2 p-2 bg-white rounded-xl border text-[10px] truncate">
                <input type="checkbox" name="pendamping" value="${u.username}"> <span>${u.username}</span>
            </label>
        `).join("");
    }
}

function cekRoleAdmin() {
    if (userLogin && userLogin.role === 'admin') {
        const navAdmin = document.getElementById('nav-admin');
        if (navAdmin) navAdmin.classList.remove('hidden');
    }
}

// Baris 746 biasanya ada di sekitar sini
async function simpanPengaturanGlobal(btn) { // <--- Pastikan ada 'btn' di sini
    // Validasi agar jika btn lupa dikirim, script tidak crash
    if (!btn) {
        console.error("Referensi tombol tidak ditemukan");
        return;
    }

    const idShift = document.getElementById('admin_pilih_shift').value;
    const jamIn = document.getElementById('admin_jam').value;
    const menitIn = document.getElementById('admin_menit').value;
    const jamOut = document.getElementById('admin_jam_keluar').value;
    const menitOut = document.getElementById('admin_menit_keluar').value;
    const tglBerlaku = document.getElementById('admin_berlaku_sampai').value;

    if (!jamIn || !jamOut || !tglBerlaku) {
        return alert("Mohon isi Jam Masuk, Jam Keluar, dan Tanggal Berlaku!");
    }

    const originalText = btn.innerText;
    btn.disabled = true; // Baris ini tidak akan error lagi
    btn.innerText = "MENGIRIM DATA...";

    try {
        const { data, error } = await supabaseClient
            .from('shift_settings')
            .update({
                jam_masuk: parseInt(jamIn),
                menit_masuk: parseInt(menitIn) || 0,
                jam_keluar: parseInt(jamOut),
                menit_keluar: parseInt(menitOut) || 0,
                berlaku_sampai: tglBerlaku + "T23:59:59Z"
            })
            .eq('id', parseInt(idShift))
            .select();

        if (error) throw error;

        alert(`SINKRONISASI BERHASIL!\nShift ${idShift} telah diperbarui.`);

        // Panggil fungsi untuk update tombol secara realtime tanpa refresh
        if (typeof updateShiftButtons === "function") {
            updateShiftButtons();
        }

    } catch (err) {
        alert("GAGAL UPDATE: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

async function uploadFotoToStorage(base64Data, folder = "presensi") {

    try {

        // Convert Base64 → Blob
        const response = await fetch(base64Data);
        const blob = await response.blob();

        // Nama file unik
        const fileName =
            `${folder}/${Date.now()}-${Math.random()
                .toString(36)
                .substring(2)}.jpg`;

        // Upload ke Supabase Storage
        const { error } = await supabaseClient
            .storage
            .from("presensi")
            .upload(fileName, blob, {
                contentType: "image/jpeg",
                upsert: false
            });

        if (error) throw error;

        // Ambil URL public
        const { data } = supabaseClient
            .storage
            .from("presensi")
            .getPublicUrl(fileName);

        return data.publicUrl;

    } catch (err) {

        console.error("Upload foto gagal:", err);

        throw err;
    }
}

async function hapusFotoStorage(urlFoto) {

    try {

        if (!urlFoto) return;

        // Ambil path setelah /presensi/
        const parts =
            urlFoto.split('/presensi/');

        if (parts.length < 2) {

            console.warn(
                "Path storage tidak valid"
            );

            return;
        }

        const filePath = parts[1];

        console.log(
            "Menghapus file:",
            filePath
        );

        const { error } =
            await supabaseClient

                .storage

                .from('presensi')

                .remove([filePath]);

        if (error) {

            console.error(
                "Gagal hapus storage:",
                error
            );
        }

    } catch (err) {

        console.error(
            "Error hapus foto:",
            err
        );
    }
}