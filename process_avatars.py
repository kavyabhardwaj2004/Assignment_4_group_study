import os
from PIL import Image, ImageDraw, ImageOps

# Configuration for characters
avatars = [
    {
        "name": "loki",
        "file": "Loki_Infobox.webp",
        "border_color": (255, 0, 0, 255),  # Red
    },
    {
        "name": "tai_lung",
        "file": "Tai_Lung_Profile.webp",
        "border_color": (139, 69, 19, 255),  # Brown
    },
    {
        "name": "gojo",
        "file": "gojo.jpg",
        "border_color": (128, 0, 128, 255),  # Purple
    },
    {
        "name": "l",
        "file": "L_death_note.jpg",
        "border_color": (128, 128, 128, 255),  # Grey
    },
    {
        "name": "illuminati",
        "file": "illuminati.webp",
        "border_color": (0, 0, 0, 255),  # Black
    },
    {
        "name": "doctor_strange",
        "file": "doctor_strange.png",
        "border_color": (255, 165, 0, 255),  # Orange
    }
]

source_dir = r"C:\Users\HP\.gemini\antigravity\scratch\temp_avatars"
output_dir = r"public\avatars"
os.makedirs(output_dir, exist_ok=True)

for avatar in avatars:
    src_file = os.path.join(source_dir, avatar["file"])
    if not os.path.exists(src_file):
        print(f"Skipping {src_file} - file not found")
        continue
    
    print(f"Processing {src_file}...")
    img = Image.open(src_file).convert("RGBA")
    
    # Square crop (centered)
    width, height = img.size
    min_dim = min(width, height)
    left = (width - min_dim) // 2
    top = (height - min_dim) // 2
    right = left + min_dim
    bottom = top + min_dim
    
    square_img = img.crop((left, top, right, bottom))
    
    # Resize inner image to 500x500 (leaving 6px on all sides for the 512x512 output)
    inner_size = 500
    resized_img = square_img.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
    
    # Create output canvas
    out_size = 512
    canvas = Image.new("RGBA", (out_size, out_size), (0, 0, 0, 0))
    
    # Create mask for inner circle
    mask = Image.new("L", (inner_size, inner_size), 0)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.ellipse((0, 0, inner_size, inner_size), fill=255)
    
    # Create the outer circle for the border
    border_canvas = Image.new("RGBA", (out_size, out_size), (0, 0, 0, 0))
    draw_border = ImageDraw.Draw(border_canvas)
    draw_border.ellipse((0, 0, out_size, out_size), fill=avatar["border_color"])
    
    # Paste outer border circle onto canvas
    canvas.alpha_composite(border_canvas)
    
    # Paste inner image onto canvas with mask (centered, offset by 6px)
    offset = (out_size - inner_size) // 2 # 6px
    temp_canvas = Image.new("RGBA", (out_size, out_size), (0, 0, 0, 0))
    temp_canvas.paste(resized_img, (offset, offset), mask=mask)
    canvas.alpha_composite(temp_canvas)
    
    # Save as WebP
    out_path = os.path.join(output_dir, f"{avatar['name']}.webp")
    canvas.save(out_path, "WEBP")
    print(f"Saved {out_path}")

print("Processing complete!")
