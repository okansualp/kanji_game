import os
import time
import re
import requests
import json
from deep_translator import GoogleTranslator

INPUT_FILE = "girdi_joyo_freq.txt"
OUTPUT_JSON = "kanji_game_data.json"

def parse_words_ordered(file_path):
    if not os.path.exists(file_path):
        print(f"Hata: {file_path} dosyası bulunamadı!")
        return []
        
    kanji_blocks = []
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    chunks = content.split("---")
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
            
        header_match = re.match(r'^(.*?)\[(N\d), freq#(\d+)\]:', chunk)
        if header_match:
            kanji_char = header_match.group(1).strip()
            jlpt_level = header_match.group(2)
            freq_rank = int(header_match.group(3))
            clean_chunk = chunk[header_match.end():]
        else:
            continue
        
        raw_words = re.split(r'[,\n]', clean_chunk)
        kanji_words = []
        seen_local = set()
        
        for w in raw_words:
            clean_w = w.strip()
            if clean_w and clean_w not in seen_local:
                seen_local.add(clean_w)
                kanji_words.append(clean_w)
                
        if kanji_words:
            kanji_blocks.append({
                "kanji": kanji_char,
                "level": jlpt_level,
                "frequency": freq_rank,
                "words": kanji_words
            })
    return kanji_blocks

def get_jisho_details(word):
    url = f"https://jisho.org/api/v1/search/words?keyword={word}"
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data['data']:
                item = data['data'][0]
                reading = item['japanese'][0].get('reading', 'Bilinmiyor')
                senses = item['senses'][0]['english_definitions']
                en_meaning = ", ".join(senses[:2])
                return reading, en_meaning
    except Exception:
        pass
    return "Bilinmiyor", "Bilinmiyor"

def main():
    blocks = parse_words_ordered(INPUT_FILE)
    total_blocks = len(blocks)
    
    if total_blocks == 0:
        print("Dosyadan kelime okunamadı.")
        return

    # Hafıza kontrolü: Daha önce kaydedilmiş veri var mı?
    game_data = []
    processed_kanjis = set()
    if os.path.exists(OUTPUT_JSON):
        try:
            with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
                game_data = json.load(f)
                processed_kanjis = {block["kanji"] for block in game_data}
            print(f"Hafıza yüklendi: {len(processed_kanjis)} Kanji zaten işlenmiş. Kaldığı yerden devam ediliyor...")
        except Exception:
            print("Mevcut JSON dosyası bozuk veya okunamadı, sıfırdan başlanıyor.")
            game_data = []

    translator = GoogleTranslator(source='en', target='tr')
    
    for idx, block in enumerate(blocks, 1):
        kanji_char = block["kanji"]
        
        # Eğer bu kanji daha önce işlendiyse pas geç
        if kanji_char in processed_kanjis:
            continue
            
        print(f"İşleniyor: {kanji_char} ({idx}/{total_blocks}) -> {len(block['words'])} kelime")
        word_list = []
        
        for word in block["words"]:
            reading, en_meaning = get_jisho_details(word)
            
            if en_meaning != "Bilinmiyor":
                first_en = en_meaning.split(',')[0].strip()
                try:
                    tr_meaning = translator.translate(first_en)
                except:
                    tr_meaning = "Çeviri Hatası"
            else:
                tr_meaning = "Bilinmiyor"
                
            word_list.append({
                "word": word,
                "reading": reading,
                "english": en_meaning,
                "turkish": tr_meaning
            })
            time.sleep(0.3)
            
        game_data.append({
            "kanji": kanji_char,
            "level": block["level"],
            "frequency": block["frequency"],
            "vocabulary": word_list
        })
        
        # Her kanji bloğu bittiğinde JSON'ı tamamen güncelle
        with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
            json.dump(game_data, f, ensure_ascii=False, indent=4)

    print(f"\nİşlem tamamlandı! Tüm veriler '{OUTPUT_JSON}' dosyasına kaydedildi.")

if __name__ == "__main__":
    main()
