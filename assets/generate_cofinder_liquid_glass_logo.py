"""
Generate a CoFinder Liquid Glass logo scene in Blender.

Run this script inside Blender. It creates:
- an 4 x 2 pane/file-list background made from flat rectangular cuboids;
- two white translucent glass crescent meshes arranged into a C-shaped data-flow mark;
- a square orthographic camera tightly framing the complete icon.

It intentionally does not write a .blend or .icns file. Render from Blender when ready.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy


# If this script is pasted into Blender's Text Editor, __file__ may not exist.
PROJECT_ROOT = Path("/Users/zwx/Programming/CoFinder")
ICON_PATH = PROJECT_ROOT / "assets/icon/icon.png"

SCENE_SIZE = 8.0
COLS = 2
ROWS = 4
CELL_W = SCENE_SIZE / COLS
CELL_H = SCENE_SIZE / ROWS
SLAB_DEPTH = 0.045
FRONT_Z = 0.0
CRESCENT_Z = 0.13
CRESCENT_THICKNESS = 0.105
CRESCENT_EDGE_RADIUS = 0.035


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def srgb_to_linear_channel(v: float) -> float:
    if v <= 0.04045:
        return v / 12.92
    return ((v + 0.055) / 1.055) ** 2.4


def linear_to_srgb_channel(v: float) -> float:
    if v <= 0.0031308:
        return 12.92 * v
    return 1.055 * (v ** (1 / 2.4)) - 0.055


def rgba_to_linear_rgb(rgba: tuple[float, float, float, float]) -> tuple[float, float, float]:
    return tuple(srgb_to_linear_channel(rgba[i]) for i in range(3))


def linear_rgb_to_rgba(rgb: tuple[float, float, float], alpha: float = 1.0) -> tuple[float, float, float, float]:
    return (*rgb, alpha)


def mix_rgb(a: tuple[float, float, float], b: tuple[float, float, float], t: float) -> tuple[float, float, float]:
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))


def sample_icon_color(img: bpy.types.Image, x: float, y: float, radius: int = 3) -> tuple[float, float, float]:
    """Sample icon color at normalized image coordinates.

    Coordinates use Blender/image convention with y=0 at bottom.
    The current production icon has triangles in the center, so callers sample
    near the left or right outer margins where the 4 x 2 background is visible.
    """

    width, height = img.size
    px = img.pixels
    cx = int(max(0, min(width - 1, x * (width - 1))))
    cy = int(max(0, min(height - 1, y * (height - 1))))
    rgb = [0.0, 0.0, 0.0]
    count = 0
    for yy in range(max(0, cy - radius), min(height, cy + radius + 1)):
        for xx in range(max(0, cx - radius), min(width, cx + radius + 1)):
            idx = (yy * width + xx) * 4
            rgb[0] += px[idx]
            rgb[1] += px[idx + 1]
            rgb[2] += px[idx + 2]
            count += 1
    srgb = tuple(c / max(1, count) for c in rgb)
    return tuple(srgb_to_linear_channel(c) for c in srgb)


def safe_cell_sample_points(row: int, col: int) -> dict[str, tuple[float, float]]:
    """Return normalized sample points in visible, mostly unobstructed margins.

    row is top-to-bottom: 0..3. y is converted to image bottom-origin coords.
    """

    x_outer = 0.08 if col == 0 else 0.92
    x_inner = 0.22 if col == 0 else 0.78
    y_top_img = 1.0 - (row + 0.18) / ROWS
    y_mid_img = 1.0 - (row + 0.50) / ROWS
    y_bottom_img = 1.0 - (row + 0.82) / ROWS
    return {
        "top_outer": (x_outer, y_top_img),
        "mid_outer": (x_outer, y_mid_img),
        "bottom_outer": (x_outer, y_bottom_img),
        "mid_inner": (x_inner, y_mid_img),
    }


def get_cell_colors(img: bpy.types.Image, row: int, col: int) -> dict[str, tuple[float, float, float]]:
    pts = safe_cell_sample_points(row, col)
    top = sample_icon_color(img, *pts["top_outer"], radius=4)
    mid = sample_icon_color(img, *pts["mid_outer"], radius=4)
    bottom = sample_icon_color(img, *pts["bottom_outer"], radius=4)
    inner = sample_icon_color(img, *pts["mid_inner"], radius=4)
    # Extrapolate a visible side-to-side gradient while staying faithful to the
    # unobstructed side samples. The center of the original icon is occluded.
    center = mix_rgb(mid, inner, 0.72)
    return {"top": top, "mid": mid, "bottom": bottom, "center": center}


def make_slab_material(name: str, colors: dict[str, tuple[float, float, float]]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    emission = nodes.new(type="ShaderNodeEmission")
    output = nodes.new(type="ShaderNodeOutputMaterial")
    emission.inputs["Color"].default_value = linear_rgb_to_rgba(colors["mid"], 1.0)
    emission.inputs["Strength"].default_value = 1.0
    mat.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return mat


def create_slab(row: int, col: int, colors: dict[str, tuple[float, float, float]]) -> bpy.types.Object:
    # Flat style: cells are mathematical cuboids with sharp 90-degree edges.
    # Add a tiny overlap so orthographic rendering cannot reveal sub-pixel gaps.
    over_y = 0.012
    over_x = 0.012
    x = -SCENE_SIZE / 2 + CELL_W * (col + 0.5)
    y = SCENE_SIZE / 2 - CELL_H * (row + 0.5)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, -SLAB_DEPTH / 2))
    slab = bpy.context.object
    slab.name = f"PaneCell_r{row + 1}_c{col + 1}_flat_cuboid"
    slab.dimensions = (CELL_W + over_x, CELL_H + over_y, SLAB_DEPTH)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    slab.data.materials.append(make_slab_material(f"mat_cell_r{row + 1}_c{col + 1}", colors))

    slab.modifiers.new("weighted_normals", "WEIGHTED_NORMAL")

    # Add a very close front gradient mesh. The cuboid supplies the real flat
    # geometry; this top face supplies the production icon's within-cell color
    # gradient without adding bevels or fake edge highlights.
    make_gradient_face(row, col, colors, x, y, CELL_W, CELL_H)
    return slab


def make_gradient_face(
    row: int,
    col: int,
    colors: dict[str, tuple[float, float, float]],
    x: float,
    y: float,
    w: float,
    h: float,
) -> bpy.types.Object:
    seg_x = 18
    seg_y = 12
    verts = []
    faces = []
    vcols = []
    for iy in range(seg_y + 1):
        ty = iy / seg_y
        for ix in range(seg_x + 1):
            tx = ix / seg_x
            px = x - w / 2 + tx * w
            py = y - h / 2 + ty * h
            verts.append((px, py, FRONT_Z + 0.002))
            # ty=0 bottom, ty=1 top in scene. Blend sampled top/bottom with a
            # left/right center tint to mimic the original icon's internal glow.
            vertical = mix_rgb(colors["bottom"], colors["top"], ty)
            horizontal = mix_rgb(colors["mid"], colors["center"], tx if col == 0 else 1 - tx)
            c = mix_rgb(vertical, horizontal, 0.38)
            vcols.append(c)
    for iy in range(seg_y):
        for ix in range(seg_x):
            a = iy * (seg_x + 1) + ix
            faces.append((a, a + 1, a + seg_x + 2, a + seg_x + 1))

    mesh = bpy.data.meshes.new(f"gradient_face_r{row + 1}_c{col + 1}_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"PaneCell_r{row + 1}_c{col + 1}_sampled_gradient", mesh)
    bpy.context.collection.objects.link(obj)

    color_attr = mesh.color_attributes.new(name="cell_gradient", type="BYTE_COLOR", domain="CORNER")
    for poly in mesh.polygons:
        for loop_idx in poly.loop_indices:
            vi = mesh.loops[loop_idx].vertex_index
            color_attr.data[loop_idx].color = linear_rgb_to_rgba(vcols[vi], 1.0)

    mat = bpy.data.materials.new(f"mat_gradient_r{row + 1}_c{col + 1}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    emission = nodes.new(type="ShaderNodeEmission")
    output = nodes.new(type="ShaderNodeOutputMaterial")
    attr = nodes.new(type="ShaderNodeAttribute")
    attr.attribute_name = "cell_gradient"
    emission.inputs["Strength"].default_value = 1.0
    mat.node_tree.links.new(attr.outputs["Color"], emission.inputs["Color"])
    mat.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    obj.data.materials.append(mat)
    return obj


def bezier(p0, p1, p2, p3, steps: int = 64) -> list[tuple[float, float]]:
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def crescent_points(kind: str) -> list[tuple[float, float]]:
    """Return points in icon-normalized coordinates, then scaled to scene.

    The two shapes follow the user's construction: ellipse-cut crescent bands,
    stacked to form a C. Coordinates are intentionally close to the provided
    black/gray sketch rather than a new symbol.
    """

    # These point lists were sampled from the user's Fig. 2 and Fig. 3 black
    # outline references, then normalized into icon coordinates. They replace
    # the previous hand-guessed Beziers because the guessed curves made the mark
    # too heavy and did not match the reference arcs closely enough.
    upper = [
        (0.6597, 0.1250), (0.5798, 0.1463), (0.5302, 0.1675), (0.4922, 0.1888),
        (0.4606, 0.2101), (0.4334, 0.2313), (0.4090, 0.2526), (0.3870, 0.2739),
        (0.3670, 0.2951), (0.3514, 0.3143), (0.3354, 0.3355), (0.3202, 0.3568),
        (0.3070, 0.3780), (0.2946, 0.3993), (0.2834, 0.4206), (0.2738, 0.4418),
        (0.2650, 0.4631), (0.2578, 0.4844), (0.2510, 0.5056), (0.2458, 0.5269),
        (0.2410, 0.5482), (0.2378, 0.5694), (0.2354, 0.5907), (0.2350, 0.6120),
        (0.2350, 0.6332), (0.2370, 0.6545), (0.2402, 0.6757), (0.2446, 0.6949),
        (0.2510, 0.7161), (0.2594, 0.7374), (0.2710, 0.7587), (0.2854, 0.7799),
        (0.3038, 0.8012), (0.3286, 0.8225), (0.3658, 0.8437), (0.4410, 0.8650),
        (0.4963, 0.8650), (0.5434, 0.8437), (0.5150, 0.8225), (0.4950, 0.8012),
        (0.4790, 0.7799), (0.4666, 0.7587), (0.4570, 0.7374), (0.4498, 0.7161),
        (0.4438, 0.6949), (0.4402, 0.6757), (0.4370, 0.6545), (0.4358, 0.6332),
        (0.4350, 0.6120), (0.4370, 0.5907), (0.4386, 0.5694), (0.4414, 0.5482),
        (0.4454, 0.5269), (0.4502, 0.5056), (0.4562, 0.4844), (0.4630, 0.4631),
        (0.4710, 0.4418), (0.4798, 0.4206), (0.4898, 0.3993), (0.5010, 0.3780),
        (0.5130, 0.3568), (0.5262, 0.3355), (0.5414, 0.3143), (0.5554, 0.2951),
        (0.5730, 0.2739), (0.5930, 0.2526), (0.6138, 0.2313), (0.6378, 0.2101),
        (0.6654, 0.1888), (0.6978, 0.1675), (0.7378, 0.1463), (0.7317, 0.1250),
    ]
    lower = [
        (0.2905, 0.4250), (0.2854, 0.4372), (0.2793, 0.4494), (0.2720, 0.4637),
        (0.2667, 0.4759), (0.2618, 0.4881), (0.2573, 0.5004), (0.2533, 0.5126),
        (0.2496, 0.5248), (0.2456, 0.5391), (0.2427, 0.5513), (0.2403, 0.5635),
        (0.2382, 0.5757), (0.2366, 0.5880), (0.2350, 0.6002), (0.2350, 0.6144),
        (0.2350, 0.6267), (0.2350, 0.6389), (0.2350, 0.6511), (0.2362, 0.6633),
        (0.2378, 0.6756), (0.2407, 0.6898), (0.2439, 0.7020), (0.2472, 0.7143),
        (0.2521, 0.7265), (0.2569, 0.7387), (0.2630, 0.7509), (0.2716, 0.7652),
        (0.2801, 0.7774), (0.2898, 0.7896), (0.3020, 0.8019), (0.3150, 0.8141),
        (0.3321, 0.8263), (0.3568, 0.8406), (0.3877, 0.8528), (0.4347, 0.8650),
        (0.5085, 0.8650), (0.5615, 0.8528), (0.6001, 0.8406), (0.6350, 0.8263),
        (0.6594, 0.8141), (0.6813, 0.8019), (0.7012, 0.7896), (0.7187, 0.7774),
        (0.7354, 0.7652), (0.7528, 0.7509), (0.7410, 0.7387), (0.6488, 0.7265),
        (0.6009, 0.7143), (0.5652, 0.7020), (0.5359, 0.6898), (0.5063, 0.6756),
        (0.4840, 0.6633), (0.4641, 0.6511), (0.4458, 0.6389), (0.4291, 0.6267),
        (0.4141, 0.6144), (0.3975, 0.6002), (0.3853, 0.5880), (0.3731, 0.5757),
        (0.3629, 0.5635), (0.3524, 0.5513), (0.3434, 0.5391), (0.3337, 0.5248),
        (0.3260, 0.5126), (0.3191, 0.5004), (0.3126, 0.4881), (0.3077, 0.4759),
        (0.3028, 0.4637), (0.2975, 0.4494), (0.2943, 0.4372), (0.2919, 0.4250),
    ]
    if kind == "upper":
        # The raster trace has a short horizontal cap at the upper-right and
        # lower tip because it samples row extrema from a stroked outline.
        # Collapse those caps back into pointed crescent tips to match the
        # user's sketch and avoid a clumsy, flattened silhouette.
        return [(0.7335, 0.1250)] + upper[1:36] + upper[37:71]
    return lower


def validate_crescent_shapes() -> None:
    upper = crescent_points("upper")
    lower = crescent_points("lower")
    upper_min_x = min(p[0] for p in upper)
    upper_max_y = max(p[1] for p in upper)
    upper_min_y = min(p[1] for p in upper)
    lower_min_x = min(p[0] for p in lower)
    lower_max_x = max(p[0] for p in lower)
    lower_max_y = max(p[1] for p in lower)

    if not (upper_min_y < 0.22 and upper_max_y > 0.82 and upper_min_x < 0.34):
        raise ValueError("Upper crescent is too short; this would recreate the forbidden Fig. 4 shape.")
    if not (lower_min_x < 0.34 and lower_max_x > 0.72 and lower_max_y > 0.82):
        raise ValueError("Lower crescent does not match the user's lower banana crescent.")


def icon_to_scene(p: tuple[float, float]) -> tuple[float, float, float]:
    x = (p[0] - 0.5) * SCENE_SIZE
    y = (0.5 - p[1]) * SCENE_SIZE
    return (x, y, CRESCENT_Z)


def create_crescent(kind: str, name: str, alpha_top: float, alpha_bottom: float) -> bpy.types.Object:
    pts = crescent_points(kind)
    curve = bpy.data.curves.new(f"{name}_curve", "CURVE")
    curve.dimensions = "2D"
    curve.resolution_u = 24
    curve.render_resolution_u = 32
    curve.fill_mode = "BOTH"
    curve.extrude = CRESCENT_THICKNESS / 2
    curve.bevel_depth = CRESCENT_EDGE_RADIUS
    curve.bevel_resolution = 10
    curve.twist_smooth = 8

    spline = curve.splines.new("POLY")
    spline.points.add(len(pts) - 1)
    for point, p in zip(spline.points, pts):
        x, y, z = icon_to_scene(p)
        point.co = (x, y, 0.0, 1.0)
    spline.use_cyclic_u = True

    obj = bpy.data.objects.new(name, curve)
    obj.location.z = CRESCENT_Z
    bpy.context.collection.objects.link(obj)

    mat = make_glass_material(f"mat_{name}", alpha_top=alpha_top, alpha_bottom=alpha_bottom)
    obj.data.materials.append(mat)
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = False
    if hasattr(obj, "cycles_visibility"):
        obj.cycles_visibility.shadow = False
    return obj


def make_glass_material(name: str, alpha_top: float, alpha_bottom: float) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.blend_method = "BLEND"
    if hasattr(mat, "use_screen_refraction"):
        mat.use_screen_refraction = True
    mat.show_transparent_back = True

    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    texcoord = nodes.new(type="ShaderNodeTexCoord")
    separate = nodes.new(type="ShaderNodeSeparateXYZ")
    ramp = nodes.new(type="ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (1.0, 1.0, 1.0, alpha_bottom)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, alpha_top)
    mat.node_tree.links.new(texcoord.outputs["Generated"], separate.inputs["Vector"])
    mat.node_tree.links.new(separate.outputs["Y"], ramp.inputs["Fac"])
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, (alpha_top + alpha_bottom) / 2)
        mat.node_tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = (alpha_top + alpha_bottom) / 2
            if "Alpha" in ramp.outputs:
                mat.node_tree.links.new(ramp.outputs["Alpha"], bsdf.inputs["Alpha"])
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.018
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.78
        elif "Transmission" in bsdf.inputs:
            bsdf.inputs["Transmission"].default_value = 0.78
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = 0.55
        elif "Clearcoat" in bsdf.inputs:
            bsdf.inputs["Clearcoat"].default_value = 0.55
        if "Coat Roughness" in bsdf.inputs:
            bsdf.inputs["Coat Roughness"].default_value = 0.035
        if "IOR" in bsdf.inputs:
            bsdf.inputs["IOR"].default_value = 1.42
    return mat


def setup_lighting_and_camera() -> None:
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.color = (0.78, 0.82, 0.88)

    softboxes = [
        ("front_giant_softbox", (0.0, 0.0, 6.2), 10.5, 120),
        ("upper_left_broad_fill", (-3.8, 3.6, 5.1), 8.5, 30),
        ("lower_right_broad_fill", (4.2, -3.2, 4.8), 8.5, 22),
    ]
    for name, loc, size, energy in softboxes:
        bpy.ops.object.light_add(type="AREA", location=loc)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.size = size

    bpy.ops.object.camera_add(location=(0, 0, 9.2), rotation=(0, 0, 0))
    cam = bpy.context.object
    cam.name = "Camera_square_orthographic"
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = SCENE_SIZE
    cam.rotation_euler = (0, 0, 0)
    bpy.context.scene.camera = cam

    scene = bpy.context.scene
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 192
        scene.cycles.use_denoising = True
        scene.cycles.max_bounces = 8
        scene.cycles.transparent_max_bounces = 8
        scene.cycles.diffuse_bounces = 3
        scene.cycles.glossy_bounces = 4
        scene.cycles.transmission_bounces = 8
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE_NEXT"
        except Exception:
            scene.render.engine = "BLENDER_EEVEE"


def main() -> None:
    reset_scene()
    validate_crescent_shapes()
    icon = bpy.data.images.load(str(ICON_PATH), check_existing=True)
    icon.colorspace_settings.name = "sRGB"

    palette = {}
    for row in range(ROWS):
        for col in range(COLS):
            palette[(row, col)] = get_cell_colors(icon, row, col)
            create_slab(row, col, palette[(row, col)])

    # Upper crescent: top more transparent, bottom more opaque.
    create_crescent("upper", "Fig2_upper_full_tall_crescent_local_to_remote_glass", alpha_top=0.34, alpha_bottom=0.80)
    # Lower crescent: top more opaque, bottom more transparent.
    create_crescent("lower", "Fig3_lower_full_banana_crescent_remote_to_local_glass", alpha_top=0.80, alpha_bottom=0.36)
    setup_lighting_and_camera()


if __name__ == "__main__":
    main()
