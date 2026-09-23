"""Calibrated adapter boundary, not a fabricated parser for proprietary BAZIS files.

The normalized native report must be signed by a separately enrolled calibration
attestor. Agent credentials alone can never certify native success. No attestors
or calibrations are shipped/enabled by migrations.
"""
import base64,json
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from .calculation_math import canonical,hash_value,dec
from .security import error


def statement(body):
    b=body.model_dump(mode='json') if hasattr(body,'model_dump') else dict(body)
    return {k:([{x:y for x,y in a.items() if x!='content_base64'} for a in v] if k=='artifacts' else v)
            for k,v in b.items() if k!='native_signature'}


def verify(c,j,run,package,body,artifacts):
    if body.execution=='fake':
        if 'executor:fake' not in j['required_capabilities'] or j['purpose']!='calculate': error(409,'FAKE_PURPOSE_DENIED')
        return None,None
    calibration=c.execute('''SELECT b.* FROM mf_bazis_export_profiles p JOIN mf_bazis_calibrations b USING(calibration_id)
         WHERE p.version=%s AND p.sha256=b.profile_sha256''',(j['export_profile_version'],)).fetchone()
    if not calibration: error(409,'BAZIS_CALIBRATION_REQUIRED')
    if body.bazis_version!=calibration['bazis_version'] or not body.native_signature: error(409,'NATIVE_ATTESTATION_REQUIRED')
    try:
        key=Ed25519PublicKey.from_public_bytes(base64.b64decode(calibration['attestor_public_key'],validate=True))
        key.verify(base64.b64decode(body.native_signature,validate=True),canonical(statement(body)).encode())
    except Exception: error(409,'NATIVE_ATTESTATION_INVALID')
    by_kind={}
    for a,data in artifacts:
        if a.kind in ('result_summary','cutting_output'):
            if a.kind in by_kind: error(409,'DUPLICATE_RESULT_KIND')
            try: by_kind[a.kind]=json.loads(data.decode('utf-8'))
            except (ValueError,UnicodeError): error(409,'NATIVE_REPORT_INVALID')
    if set(by_kind)!={'result_summary','cutting_output'}: error(409,'EXPECTED_RESULT_FILES_REQUIRED')
    expected={k:str(v) for k,v in {'job_id':j['job_id'],'run_id':run['run_id'],'order_id':j['order_id'],
        'revision_id':j['revision_id'],'calculation_id':j['calculation_id'],'input_manifest_hash':package['manifest_sha256']}.items()}
    for report in by_kind.values():
        if not isinstance(report,dict) or report.get('schema')!='mf-native-result-v1' or any(report.get(k)!=v for k,v in expected.items()): error(409,'NATIVE_RUN_MISMATCH')
        if report.get('bazis_version')!=body.bazis_version or report.get('fatal_errors')!=[] or report.get('status')!='succeeded': error(409,'NATIVE_FATAL_OR_INCOMPLETE')
        if report.get('manufacturing_sha256')!=j['input_hash']: error(409,'NATIVE_INPUT_MISMATCH')
    summary=by_kind['result_summary'];output=by_kind['cutting_output']
    if summary.get('materials')!=output.get('materials') or summary.get('parts')!=output.get('parts'): error(409,'NATIVE_OUTPUT_MISMATCH')
    expected_parts=[];expected_materials={}
    for p in j['manifest']['manufacturing']['parts']:
        b=p['blank'];key=p['material_key']+':'+p['supply_source']
        expected_materials[key]=p['material']
        expected_parts.append({'detail_id':b['detail_id'],'material_key':key,'length':b['length'],'width':b['width'],'qty':b['qty'],
            'grain':p['grain'],'rotation_allowed':p['rotation_allowed'],
            'edges':{s:e['edge']['identity_sha256'] if e['edge'] else None for s,e in b['edges'].items()}})
    if summary.get('parts')!=expected_parts: error(409,'NATIVE_PART_OR_EDGE_MISMATCH')
    materials=summary.get('materials')
    if not isinstance(materials,list) or len(materials)!=len(expected_materials): error(409,'NATIVE_MATERIAL_MISMATCH')
    seen=set()
    for m in materials:
        if not isinstance(m,dict) or m.get('material_key') not in expected_materials or m['material_key'] in seen: error(409,'NATIVE_MATERIAL_MISMATCH')
        seen.add(m['material_key']);expected_material=expected_materials[m['material_key']]
        if m.get('identity_sha256')!=expected_material['identity_sha256'] or not isinstance(m.get('native_mapping_id'),str) or not 1<=len(m['native_mapping_id'])<=100:
            error(409,'NATIVE_MAPPING_MISMATCH')
        if type(m.get('sheet_count')) is not int or not 1<=m['sheet_count']<=10000 or m.get('cut_basis')!='excluding_trim': error(409,'NATIVE_FACTS_INVALID')
        try:
            cut=dec(m['cut_metres'])
            if not cut.is_finite() or cut<0 or cut>100000: raise ValueError()
        except (ValueError,ArithmeticError,KeyError): error(409,'NATIVE_FACTS_INVALID')
    warnings=summary.get('warnings')
    if not isinstance(warnings,list) or len(warnings)>100 or any(not isinstance(w,str) or len(w)>500 for w in warnings): error(409,'NATIVE_WARNINGS_INVALID')
    if body.status!='succeeded': error(409,'NATIVE_FATAL_OR_INCOMPLETE')
    if j['purpose']=='produce' and not run['physical_started']: error(409,'PHYSICAL_START_REQUIRED')
    return calibration['calibration_id'],summary
