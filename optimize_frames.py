import os
import shutil
from PIL import Image
from concurrent.futures import ThreadPoolExecutor
import time

def process_file(args):
    src, dst, quality = args
    try:
        with Image.open(src) as im:
            # Preserve pristine native 1920x1080 Full HD quality
            im.save(dst, 'WEBP', quality=quality, method=4)
    except Exception as e:
        print(f"Error processing {src}: {e}")

def main():
    t0 = time.time()
    print("Beginning High-Fidelity 1080p Frame Processing...")
    
    # Fresh generation to ensure all old/mismatched frames are cleared
    for folder in ['frames_dark_opt', 'frames_light_opt']:
        if os.path.exists(folder):
            shutil.rmtree(folder)
        os.makedirs(folder, exist_ok=True)
        
    tasks = []
    
    # Dark frames (276 frames)
    dark_files = sorted([f for f in os.listdir('Dark theme frames') if f.endswith('.png')])
    for fn in dark_files:
        src = os.path.join('Dark theme frames', fn)
        out_name = fn.replace('ezgif-frame-', 'frame_').replace('.png', '.webp')
        dst = os.path.join('frames_dark_opt', out_name)
        tasks.append((src, dst, 88))
        
    # Light frames (276 frames)
    light_files = sorted([f for f in os.listdir('Light theme frames') if f.endswith('.png')])
    for fn in light_files:
        src = os.path.join('Light theme frames', fn)
        out_name = fn.replace('ezgif-frame-', 'frame_').replace('.png', '.webp')
        dst = os.path.join('frames_light_opt', out_name)
        tasks.append((src, dst, 88))
        
    print(f"Encoding {len(tasks)} frames ({len(dark_files)} dark, {len(light_files)} light) at native 1920x1080 WebP (Quality 88)...")
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(process_file, tasks))
        
    dark_count = len(os.listdir('frames_dark_opt'))
    light_count = len(os.listdir('frames_light_opt'))
    elapsed = time.time() - t0
    print(f"Done in {elapsed:.1f}s! Generated {dark_count} dark frames and {light_count} light frames.")

if __name__ == '__main__':
    main()
