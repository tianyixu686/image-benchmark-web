import pickle
import sys

def check_pickle(filepath):
    try:
        with open(filepath, 'rb') as f:
            data = pickle.load(f)
        print(f"Type: {type(data)}")
        print(f"Length: {len(data) if hasattr(data, '__len__') else 'N/A'}")
        if hasattr(data, 'keys'):
            print(f"Keys: {list(data.keys())}")
            for key in data.keys():
                val = data[key]
                print(f"  {key}: {type(val)}, shape/size: {val.shape if hasattr(val, 'shape') else len(val) if hasattr(val, '__len__') else 'N/A'}")
        elif isinstance(data, list):
            print(f"First element: {type(data[0]) if len(data) > 0 else 'empty'}")
        elif isinstance(data, dict):
            print(f"Dict keys: {list(data.keys())}")
        # 尝试打印一些样本
        print("\nSample data (first few items):")
        if isinstance(data, dict):
            for i, (k, v) in enumerate(list(data.items())[:3]):
                print(f"  {k}: {v}")
        elif hasattr(data, '__len__') and len(data) > 0:
            for i in range(min(3, len(data))):
                print(f"  {i}: {data[i]}")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    filepath = sys.argv[1] if len(sys.argv) > 1 else '../benchmark/preprocessed_data.pkl'
        filepath = sys.argv[1] if len(sys.argv) > 1 else '../benchmark(1)/preprocessed_data_gram.pkl'
    print(f"Checking {filepath}")
    check_pickle(filepath)