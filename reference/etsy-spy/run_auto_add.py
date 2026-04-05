#!/usr/bin/env python3
"""
Run auto-add task by calling the original script with proper permissions.
"""

import os
import sys

# Change to the etsy-spy directory
os.chdir("/Users/duytan/.openclaw/skills/etsy-spy")

# Run the original script
os.system("/usr/bin/python3 add_qualified_ideas.py")