import json
import re
import sys

def fix_graph_data(file_path):
    with open(file_path, 'r') as f:
        data = f.read()

    print(f"Original file size: {len(data)} bytes")

    double_escape_count = data.count('\\\\n')
    print(f"Found {double_escape_count} double-escaped newlines (\\\\n)")
    data = data.replace('\\\\n', '\\n')

    parsed = json.loads(data)
    print("Outer JSON parsed successfully")

    def fix_string_value(value, node_id=None):
        if isinstance(value, str):
            fixed = value.replace('\n', '\\n').replace('\r', '\\r')
            fixed = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', fixed)
            
            if fixed != value or ('TEMP_ID' in fixed and node_id):
                try:
                    parsed_value = json.loads(fixed)
                    if isinstance(parsed_value, dict) and parsed_value.get('id') == 'TEMP_ID' and node_id:
                        parsed_value['id'] = node_id
                        return json.dumps(parsed_value)
                except:
                    pass
            return fixed
        return value

    fixed_temp_count = 0
    fixed_node_count = 0

    if 'nodes' in parsed and isinstance(parsed['nodes'], list):
        for node in parsed['nodes']:
            node_id = node.get('id', None)
            has_changes = False
            
            if 'name' in node:
                original_name = node['name']
                node['name'] = fix_string_value(node['name'], node_id)
                if node['name'] != original_name:
                    has_changes = True
                    if 'TEMP_ID' in original_name and 'TEMP_ID' not in node['name']:
                        fixed_temp_count += 1
            
            if 'metadata' in node and isinstance(node['metadata'], dict):
                for key, value in node['metadata'].items():
                    if isinstance(value, str):
                        original_value = value
                        node['metadata'][key] = fix_string_value(value, node_id)
                        if node['metadata'][key] != original_value:
                            has_changes = True
                            if 'TEMP_ID' in original_value and 'TEMP_ID' not in node['metadata'][key]:
                                fixed_temp_count += 1
            
            if has_changes:
                fixed_node_count += 1

    print(f"\nFixed {fixed_temp_count} TEMP_ID occurrences")
    print(f"Fixed {fixed_node_count} nodes with control characters")

    output = json.dumps(parsed, indent=2)
    with open(file_path, 'w') as f:
        f.write(output)

    print(f"\nFile saved successfully")
    print(f"New file size: {len(output)} bytes")

    with open(file_path, 'r') as f:
        final_data = f.read()
    final_temp_count = final_data.count('TEMP_ID')
    print(f"\nVerification: {final_temp_count} occurrences of 'TEMP_ID' remaining")

    try:
        json.loads(final_data)
        print("Final JSON is valid!")
    except Exception as e:
        print(f"Final JSON parsing error: {e}")
        return False

    return True

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python fixGraphData.py <graph.json file path>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    success = fix_graph_data(file_path)
    sys.exit(0 if success else 1)