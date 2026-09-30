import streamlit as st
import json
import os
import qrcode
from io import BytesIO

# Танзимоти саҳифа
st.set_page_config(page_title="Санҷиши ҳуҷҷатҳои расмӣ", page_icon="🛡️", layout="centered")

UPLOAD_DIR = "uploaded_documents"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

DB_FILE = "database.json"


def load_db():
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except:
                return {}
    return {}


def save_db(data):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


database = load_db()


# Функция барои сохтани QR-код
def generate_qr(data_text):
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=2,
    )
    qr.add_data(data_text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    return buffered.getvalue()


# Тарҳрезии CSS барои намуди расмӣ
st.markdown("""
    <style>
    .stApp {
        background-color: #f0f2f5;
    }
    .main-header {
        background-color: #ffffff;
        padding: 20px;
        border-radius: 8px;
        text-align: center;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        margin-bottom: 15px;
    }
    .success-icon {
        font-size: 40px;
        color: #2e7d32;
        margin-bottom: 5px;
    }
    .doc-card {
        background-color: #ffffff;
        padding: 14px 18px;
        border-radius: 6px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        margin-bottom: 10px;
        border-left: 4px solid #2e7d32;
    }
    .label-title {
        font-size: 13px;
        color: #666666;
        font-weight: 500;
        margin-bottom: 3px;
    }
    .label-value {
        font-size: 16px;
        color: #111111;
        font-weight: 600;
    }
    </style>
""", unsafe_allow_html=True)

query_params = st.query_params
doc_id_param = query_params.get("doc", None)

if doc_id_param:
    if doc_id_param in database:
        doc = database[doc_id_param]

        # Қисми болоӣ (Тасдиқи ЭЦП)
        st.markdown(f"""
            <div class="main-header">
                <div class="success-icon">✔</div>
                <h3 style="color: #2e7d32; margin: 0;">Ҳуҷҷат тасдиқ карда шудааст</h3>
                <p style="color: #555555; font-size: 14px; margin-top: 5px;">Имзои электронӣ эътибор дорад</p>
            </div>
        """, unsafe_allow_html=True)

        # Рақами ҳуҷҷат ва ном
        st.markdown(f"""
            <div class="doc-card">
                <div class="label-title">Рақами ҳуҷҷат / Номгӯй</div>
                <div class="label-value">{doc_id_param} — {doc['title']}</div>
                <div style="font-size: 12px; color: #888888; margin-top: 4px;">Сана: {doc['date']}</div>
            </div>
        """, unsafe_allow_html=True)

        # Муассиса
        st.markdown(f"""
            <div class="doc-card">
                <div class="label-title">Мақомот / Муассиса</div>
                <div class="label-value">{doc['org']}</div>
            </div>
        """, unsafe_allow_html=True)

        # Кем подписан
        st.markdown(f"""
            <div class="doc-card">
                <div class="label-title">Кем подписан (Шахси имзокунанда)</div>
                <div class="label-value">{doc['signed_by']}</div>
            </div>
        """, unsafe_allow_html=True)

        # Исполнитель документа
        st.markdown(f"""
            <div class="doc-card">
                <div class="label-title">Исполнитель документа (Иҷрокунанда)</div>
                <div class="label-value">{doc['executor']}</div>
            </div>
        """, unsafe_allow_html=True)

        # Организация предоставлена ЭЦП
        st.markdown(f"""
            <div class="doc-card">
                <div class="label-title">Организация предоставлена ЭЦП</div>
                <div class="label-value">{doc['ecp_org']}</div>
            </div>
        """, unsafe_allow_html=True)

        # Срок действия ЭЦП
        st.markdown(f"""
            <div class="doc-card">
                <div class="label-title">Срок действия ЭЦП</div>
                <div class="label-value">{doc['ecp_expiry']}</div>
            </div>
        """, unsafe_allow_html=True)

        # Файлҳо
        pdf_path = os.path.join(UPLOAD_DIR, doc['pdf_name']) if doc['pdf_name'] else None
        xls_path = os.path.join(UPLOAD_DIR, doc['xls_name']) if doc['xls_name'] else None

        st.markdown("### 📁 Файлҳои замимашуда ва ҳуҷҷатҳо")
        if pdf_path and os.path.exists(pdf_path):
            with open(pdf_path, "rb") as f:
                st.download_button(label=f"📥 Боргирии ҳуҷҷат (PDF): {doc['pdf_name']}", data=f,
                                   file_name=doc['pdf_name'], mime="application/pdf")

        if xls_path and os.path.exists(xls_path):
            with open(xls_path, "rb") as f:
                st.download_button(label=f"📊 Боргирии ҷадвал (Excel): {doc['xls_name']}", data=f,
                                   file_name=doc['xls_name'])

    else:
        st.error("❌ Ҳуҷҷат бо ин рақам дар пойгоҳи додаҳо ёфт нашуд!")

else:
    # Панели идоракунӣ барои илова ва гирифтани QR-код
    st.markdown("### 🛠️ Панели идоракунӣ ва сохтани QR-код")
    menu = st.selectbox("Амал:", ["➕ Илова кардани ҳуҷҷати нав ва сохтани QR", "🔍 Санҷиши рақам"])

    if "Илова кардани" in menu:
        with st.form("add_form"):
            doc_id = st.text_input("Рақами беназири ҳуҷҷат (Масалан: YR80646727)")
            doc_title = st.text_input("Мавзӯъ ё намуди ҳисобот (Масалан: Ҳисоботи 9-моҳа)")
            doc_date = st.text_input("Санаи барориш (Масалан: 25 сен 2026)")
            doc_org = st.text_input("Муассиса",
                                    value="МД «Маркази ҷумҳуриявии таҳлил, иттилоот ва технологияҳои рақамӣ»")
            signed_by = st.text_input("Кем подписан", value="Муҳаммадраҷабзода Комрон")
            executor = st.text_input("Исполнитель документа", value="Ҳасан Ҳайдаров")
            ecp_org = st.text_input("Организация предоставлена ЭЦП", value="Innovation Agency")
            ecp_expiry = st.text_input("Срок действия ЭЦП", value="23 янв 2027")

            # Майдони ворид кардани линки сервер ё IP
            server_url = st.text_input("Суроғаи сомона ё IP-и сервер (Масалан: http://192.168.1.50:8501/)")

            uploaded_pdf = st.file_uploader("Файли PDF", type=["pdf"])
            uploaded_xls = st.file_uploader("Файли Excel", type=["xls", "xlsx"])

            submitted = st.form_submit_button("💾 Захира кардан ва тавлиди QR-код")

            if submitted and doc_id:
                pdf_name = uploaded_pdf.name if uploaded_pdf else ""
                xls_name = uploaded_xls.name if uploaded_xls else ""

                if uploaded_pdf:
                    with open(os.path.join(UPLOAD_DIR, pdf_name), "wb") as f: f.write(uploaded_pdf.getbuffer())
                if uploaded_xls:
                    with open(os.path.join(UPLOAD_DIR, xls_name), "wb") as f: f.write(uploaded_xls.getbuffer())

                database[doc_id] = {
                    "title": doc_title, "date": doc_date, "org": doc_org,
                    "signed_by": signed_by, "executor": executor,
                    "ecp_org": ecp_org, "ecp_expiry": ecp_expiry,
                    "pdf_name": pdf_name, "xls_name": xls_name
                }
                save_db(database)
                st.success("Ҳуҷҷат бомуваффақият сабт шуд!")

                # Сохтани линки пурра барои QR-код
                full_link = f"{server_url.strip('/')}/?doc={doc_id}"
                st.info(f"Линки мустақим: {full_link}")

                # Тавлид ва нишон додани QR-код
                qr_bytes = generate_qr(full_link)
                st.image(qr_bytes, caption=f"QR-коди ҳуҷҷати {doc_id}", width=250)
                st.download_button(
                    label="📥 Боргирии ин QR-код (PNG)",
                    data=qr_bytes,
                    file_name=f"QR_{doc_id}.png",
                    mime="image/png"
                )
    else:
        s_code = st.text_input("Рақами ҳуҷҷатро нависед:")
        if st.button("Санҷидан"):
            st.markdown(f"🔗 [Кушодани саҳифаи ҳуҷҷат](?doc={s_code})")
